import { EventEmitter } from 'events';

import { MessagePack } from '../util/message-pack';
import { UUID } from '../util/uuid';
import { setZeroTimeout } from '../util/zero-timeout';
import { SkyWayStatsMonitor } from './skyway-stats-monitor';
import { CandidateType, WebRTCStats } from './webrtc-stats';

// @types/skywayを使用すると@types/webrtcが定義エラーになるので代替定義
declare module PeerJs {
  export type Peer = any;
  export type DataConnection = any;
}

interface Ping {
  from: string;
  ping: number;
};

interface DataChank {
  id: string;
  data: Uint8Array;
  index: number;
  total: number;
};

interface ReceivedChank {
  id: string;
  chanks: Uint8Array[];
  length: number;
  byteLength: number;
};

export class SkyWayDataConnection extends EventEmitter {
  private chunkSize = 15.5 * 1024;
  private receivedMap: Map<string, ReceivedChank> = new Map();
  private timeoutTimer: NodeJS.Timer = null;

  get open(): boolean { return this.conn.open; }
  get remoteId(): string { return this.conn.remoteId; }
  get metadata(): any { return this.conn.metadata; }
  get bufferedAmount(): number { return this.conn._dc?.bufferedAmount ?? 0; }

  private stats: WebRTCStats;

  private _timestamp: number = performance.now();
  get timestamp(): number { return this._timestamp; }
  private set timestamp(timestamp: number) { this._timestamp = timestamp };

  private _ping: number = 0;
  get ping(): number { return this._ping; }
  private set ping(ping: number) { this._ping = ping };

  private _candidateType: CandidateType = CandidateType.UNKNOWN;
  get candidateType(): CandidateType { return this._candidateType; }
  private set candidateType(candidateType: CandidateType) { this._candidateType = candidateType };

  constructor(private conn: PeerJs.DataConnection) {
    super();
    conn.on('data', data => this.onData(data));
    conn.on('open', () => {
      this.stats = new WebRTCStats(this.getPeerConnection());
      this.clearTimeoutTimer();
      exchangeSkyWayImplementation(conn);
      this.emit('open');
      this.startMonitoring();
    });
    conn.on('close', () => {
      this.clearTimeoutTimer();
      this.emit('close');
    });
    conn.on('error', err => {
      this.clearTimeoutTimer();
      this.emit('error', err);
    });

    this.setTimeoutTimer();
  }

  close() {
    this.clearTimeoutTimer();
    this.stopMonitoring();
    this.conn.close();
  }

  send(data: any) {
    let encodedData: Uint8Array = MessagePack.encode(data);

    let total = Math.ceil(encodedData.byteLength / this.chunkSize);
    if (total <= 1) {
      this.conn.send(encodedData);
      return;
    }

    let id = UUID.generateUuid();

    let sliceData: Uint8Array = null;
    let chank: DataChank = null;
    for (let sliceIndex = 0; sliceIndex < total; sliceIndex++) {
      sliceData = encodedData.slice(sliceIndex * this.chunkSize, (sliceIndex + 1) * this.chunkSize);
      chank = { id: id, data: sliceData, index: sliceIndex, total: total };
      this.conn.send(MessagePack.encode(chank));
    }
  }

  getPeerConnection(): RTCPeerConnection {
    return this.conn.getPeerConnection();
  }

  private startMonitoring() {
    SkyWayStatsMonitor.add(this);
  }

  private stopMonitoring() {
    SkyWayStatsMonitor.remove(this);
  }

  async updateStatsAsync() {
    if (this.stats == null) return;
    this.sendPing();
    await this.stats.updateAsync();
    this.candidateType = this.stats.candidateType;
    this.emit('stats', this.stats);
  }

  sendPing() {
    let encodedData: Uint8Array = MessagePack.encode({ from: this.remoteId, ping: performance.now() });
    this.conn.send(encodedData);
  }

  private receivePing(ping: Ping) {
    if (ping.from === this.remoteId) {
      let now = performance.now();
      let rtt = now - ping.ping;
      this.ping = rtt <= this.ping ? (this.ping * 0.5) + (rtt * 0.5) : rtt;
    } else {
      let encodedData = MessagePack.encode(ping);
      this.conn.send(encodedData);
    }
  }

  private onData(data: ArrayBuffer) {
    this.timestamp = performance.now();
    let decoded: unknown = MessagePack.decode(new Uint8Array(data));

    let ping: Ping = decoded as Ping;
    if (ping.ping != null) {
      this.receivePing(ping);
      return;
    }

    let chank: DataChank = decoded as DataChank;
    if (chank.id == null) {
      this.emit('data', decoded);
      return;
    }

    let received = this.receivedMap.get(chank.id);
    if (received == null) {
      received = { id: chank.id, chanks: new Array(chank.total), length: 0, byteLength: 0 };
      this.receivedMap.set(chank.id, received);
    }

    if (received.chanks[chank.index] != null) return;

    received.length++;
    received.byteLength += chank.data.byteLength;
    received.chanks[chank.index] = chank.data;

    if (received.length < chank.total) return;
    this.receivedMap.delete(chank.id);

    let uint8Array = new Uint8Array(received.byteLength);

    let pos = 0;
    for (let c of received.chanks) {
      uint8Array.set(c, pos);
      pos += c.byteLength;
    }

    let decodedChank = MessagePack.decode(uint8Array);
    this.emit('data', decodedChank);
  }

  private setTimeoutTimer() {
    this.clearTimeoutTimer();
    this.timeoutTimer = setTimeout(() => {
      console.warn(`timeout ${this.conn.remoteId}`);
      this.timeoutTimer = null;
      this.emit('close');
    }, 15000);
  }

  private clearTimeoutTimer() {
    if (this.timeoutTimer == null) return;
    clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
  }
}

/* 
SkyWay の DataConnection._startSendLoop() を取り替える.
setInterval() に由来する遅延を解消するが skyway-js-sdk の更新次第で動作しなくなるので注意.

https://github.com/skyway/skyway-js-sdk/blob/master/src/peer/dataConnection.js
*/
function exchangeSkyWayImplementation(conn: PeerJs.DataConnection) {
  if (conn._dc && conn._sendBuffer) {
    conn._startSendLoop = startSendLoopZeroTimeout;
  }
}

function startSendLoopZeroTimeout() {
  if (!this.sendInterval) {
    this.sendInterval = setZeroTimeout(sendBuffertZeroTimeout.bind(this));
  }
}

function sendBuffertZeroTimeout() {
  const currMsg = this._sendBuffer.shift();
  try {
    this._dc.send(currMsg);
  } catch (error) {
    this._sendBuffer.push(currMsg);
  }

  if (this._sendBuffer.length === 0) {
    this.sendInterval = undefined;
  } else {
    this.sendInterval = setZeroTimeout(sendBuffertZeroTimeout.bind(this));
  }
}
