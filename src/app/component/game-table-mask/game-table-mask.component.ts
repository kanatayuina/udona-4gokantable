import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy
} from '@angular/core';
import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { EventSystem, Network } from '@udonarium/core/system';
import { MathUtil } from '@udonarium/core/system/util/math-util';
import { GameTableMask } from '@udonarium/game-table-mask';
import { PresetSound, SoundEffect } from '@udonarium/sound-effect';
import { GameCharacterSheetComponent } from 'component/game-character-sheet/game-character-sheet.component';
import { InputHandler } from 'directive/input-handler';
import { MovableOption } from 'directive/movable.directive';
import { ContextMenuAction, ContextMenuSeparator, ContextMenuService } from 'service/context-menu.service';
import { CoordinateService } from 'service/coordinate.service';
import { PanelOption, PanelService } from 'service/panel.service';
import { PointerDeviceService } from 'service/pointer-device.service';
import { TabletopActionService } from 'service/tabletop-action.service';
import { SelectionState, TabletopSelectionService } from 'service/tabletop-selection.service';
import { Card } from '@udonarium/card';
import { CardStack } from '@udonarium/card-stack';
import { TabletopService } from 'service/tabletop.service';

@Component({
  selector: 'game-table-mask',
  templateUrl: './game-table-mask.component.html',
  styleUrls: ['./game-table-mask.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameTableMaskComponent implements OnChanges, OnDestroy, AfterViewInit {
  @Input() gameTableMask: GameTableMask = null;
  @Input() is3D: boolean = false;

  get name(): string { return this.gameTableMask.name; }
  get width(): number { return MathUtil.clampMin(this.gameTableMask.width); }
  get height(): number { return MathUtil.clampMin(this.gameTableMask.height); }
  get opacity(): number { return this.gameTableMask.opacity; }
  get imageFile(): ImageFile { return this.gameTableMask.imageFile; }
  get isLock(): boolean { return this.gameTableMask.isLock; }
  set isLock(isLock: boolean) { this.gameTableMask.isLock = isLock; }

  get selectionState(): SelectionState { return this.selectionService.state(this.gameTableMask); }
  get isSelected(): boolean { return this.selectionState !== SelectionState.NONE; }
  get isMagnetic(): boolean { return this.selectionState === SelectionState.MAGNETIC; }

  get isHandArea(): boolean { return this.gameTableMask.isHandArea; }
  set isHandArea(isHandArea: boolean) { this.gameTableMask.isHandArea = isHandArea; }
  get isRotateArea(): boolean { return this.gameTableMask.isRotateArea; }
  set isRotateArea(isRotateArea: boolean) { this.gameTableMask.isRotateArea = isRotateArea; }

  gridSize: number = 50;

  movableOption: MovableOption = {};

  private input: InputHandler = null;

  constructor(
    private ngZone: NgZone,
    private tabletopActionService: TabletopActionService,
    private contextMenuService: ContextMenuService,
    private elementRef: ElementRef<HTMLElement>,
    private panelService: PanelService,
    private changeDetector: ChangeDetectorRef,
    private selectionService: TabletopSelectionService,
    private pointerDeviceService: PointerDeviceService,
    private coordinateService: CoordinateService,
    private tabletopService: TabletopService,
  ) { }

  ngOnChanges(): void {
    EventSystem.unregister(this);
    EventSystem.register(this)
      .on(`UPDATE_GAME_OBJECT/identifier/${this.gameTableMask?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on(`UPDATE_OBJECT_CHILDREN/identifier/${this.gameTableMask?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on('SYNCHRONIZE_FILE_LIST', event => {
        this.changeDetector.markForCheck();
      })
      .on('UPDATE_FILE_RESOURE', event => {
        this.changeDetector.markForCheck();
      })
      .on(`UPDATE_SELECTION/identifier/${this.gameTableMask?.identifier}`, event => {
        this.changeDetector.markForCheck();
      });
    this.movableOption = {
      tabletopObject: this.gameTableMask,
      transformCssOffset: 'translateZ(0.15px)',
      colideLayers: ['terrain']
    };
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.input = new InputHandler(this.elementRef.nativeElement);
    });
    this.input.onStart = this.onInputStart.bind(this);
  }

  ngOnDestroy() {
    this.input.destroy();
    EventSystem.unregister(this);
  }

  // TODO:rotateに未対応。厳密なカードサイズの取得方法が未整理(2:3で仮決め)
  @HostListener('carddrop', ['$event'])
  onCardDrop(e) {
    if (this.gameTableMask === e.detail || (e.detail instanceof GameTableMask === false && e.detail instanceof Card === false)) {
      return;
    }
    if (this.isHandArea === false && this.isRotateArea === false) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();

    if (e.detail instanceof Card) {
      let card: Card = e.detail;
      let toleranceX: number = card.size * 50 * 0.2;
      let toleranceY: number = card.size * 75 * 0.2;

      // let beforeDistance: number = (card.startLocation.x - this.gameTableMask.location.x) ** 2 + (card.startLocation.y - this.gameTableMask.location.y) ** 2 + (card.posZ - this.gameTableMask.posZ) ** 2;
      // let already: boolean = beforeDistance < 100 ** 2;
      let already: boolean = (this.gameTableMask.location.x < card.startLocation.x + toleranceX) && (this.gameTableMask.location.y < card.startLocation.y + toleranceY) && (card.startLocation.x + card.size * 50 - toleranceX < this.gameTableMask.location.x + this.gameTableMask.width * 50) && (card.startLocation.y + card.size * 75 - toleranceY < this.gameTableMask.location.y + this.gameTableMask.height * 50);

      // let distance: number = (card.location.x - this.gameTableMask.location.x) ** 2 + (card.location.y - this.gameTableMask.location.y) ** 2 + (card.posZ - this.gameTableMask.posZ) ** 2;
      // let overlapped: boolean = distance < 100 ** 2;
      let overlapped: boolean = (this.gameTableMask.location.x < card.location.x + toleranceX) && (this.gameTableMask.location.y < card.location.y + toleranceY) && (card.location.x + card.size * 50 - toleranceX < this.gameTableMask.location.x + this.gameTableMask.width * 50) && (card.location.y + card.size * 75 - toleranceY < this.gameTableMask.location.y + this.gameTableMask.height * 50);

      if (overlapped && this.isHandArea && !card.isHand) {
        SoundEffect.play(PresetSound.cardDraw);
        card.faceDown();
        card.owner = Network.peer.userId;
      }
      if (!already && overlapped && this.isRotateArea) {
      // if (overlapped && this.isRotateArea) {
        SoundEffect.play(PresetSound.cardDraw);
        // let addition: number = 90;
        // if (360 < card.rotate + addition) addition -= 360;
        card.rotate = this.gameTableMask.cardRotate;
      }
      // if(overlapped) this.overlappedCards.push(card);
    }
  }

  @HostListener('dragstart', ['$event'])
  onDragstart(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  onInputStart(e: any) {
    this.input.cancel();

    // TODO:もっと良い方法考える
    if (this.isLock) {
      EventSystem.trigger('DRAG_LOCKED_OBJECT', { srcEvent: e });
    }
  }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    let menuPosition = this.pointerDeviceService.pointers[0];

    let menuActions: ContextMenuAction[] = [];
    menuActions = menuActions.concat(this.makeSelectionContextMenu());
    menuActions = menuActions.concat(this.makeContextMenu());

    this.contextMenuService.open(menuPosition, menuActions, this.name);
  }

  onMove() {
    this.contextMenuService.close();
    SoundEffect.play(PresetSound.cardPick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
  }

  private makeSelectionContextMenu(): ContextMenuAction[] {
    if (this.selectionService.objects.length < 1) return [];

    let actions: ContextMenuAction[] = [];

    let objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    actions.push({ name: 'ここに集める', action: () => this.selectionService.congregate(objectPosition) });

    if (this.isSelected) {
      let selectedGameTableMasks = () => this.selectionService.objects.filter(object => object.aliasName === this.gameTableMask.aliasName) as GameTableMask[];
      actions.push(
        {
          name: '選択したマップマスク', action: null, subActions: [
            {
              name: 'すべて固定する', action: () => {
                selectedGameTableMasks().forEach(gameTableMask => gameTableMask.isLock = true);
                SoundEffect.play(PresetSound.lock);
              }
            },
            {
              name: 'すべてのコピーを作る', action: () => {
                selectedGameTableMasks().forEach(gameTableMask => {
                  let cloneObject = gameTableMask.clone();
                  cloneObject.location.x += this.gridSize;
                  cloneObject.location.y += this.gridSize;
                  cloneObject.isLock = false;
                  if (gameTableMask.parent) gameTableMask.parent.appendChild(cloneObject);
                });
                SoundEffect.play(PresetSound.cardPut);
              }
            },
          ]
        }
      );
    }
    actions.push(ContextMenuSeparator);
    return actions;
  }

  private makeContextMenu(): ContextMenuAction[] {
    let objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    let actions: ContextMenuAction[] = [];
    actions.push({
        name: '乗っているカードの向きを揃える', action: () => {
          this.rotateCards(this.gameTableMask.cardRotate);
          SoundEffect.play(PresetSound.cardPut);
        }
      },
      {
        name: '乗っているカードで山札を作る', action: () => {
          this.createStack();
          SoundEffect.play(PresetSound.cardPut);
        }
      });
    actions.push(ContextMenuSeparator);
    actions.push((this.isLock
      ? {
        name: '固定解除', action: () => {
          this.isLock = false;
          SoundEffect.play(PresetSound.unlock);
        }
      }
      : {
        name: '固定する', action: () => {
          this.isLock = true;
          SoundEffect.play(PresetSound.lock);
        }
      }
    ));
    actions.push((this.isHandArea
      ? {
        name: '手札エリア解除', action: () => {
          this.isHandArea = false;
          SoundEffect.play(PresetSound.unlock);
        }
      }
      : {
        name: '手札エリアにする', action: () => {
          this.isHandArea = true;
          SoundEffect.play(PresetSound.lock);
        }
      }
    ));
    actions.push((this.isRotateArea
      ? {
        name: 'カード揃えエリア解除', action: () => {
          this.isRotateArea = false;
          SoundEffect.play(PresetSound.unlock);
        }
      }
      : {
        name: 'カード揃えエリアにする', action: () => {
          this.isRotateArea = true;
          SoundEffect.play(PresetSound.lock);
        }
      }
    ));
    if (!this.isLock) {
      actions.push(ContextMenuSeparator);
      actions.push({
        name: '重なり順を一番上に', action: () => {
          let parent = this.gameTableMask.parent;
          if (parent) parent.appendChild(this.gameTableMask);
        }
      });
      actions.push({
        name: '重なり順を一番下に', action: () => {
          let parent = this.gameTableMask.parent;
          if (parent) parent.prependChild(this.gameTableMask);
        }
      });
    }
    actions.push(ContextMenuSeparator);
    actions.push({ name: 'マップマスクを編集', action: () => { this.showDetail(this.gameTableMask); } });
    actions.push({
      name: 'コピーを作る', action: () => {
        let cloneObject = this.gameTableMask.clone();
        cloneObject.location.x += this.gridSize;
        cloneObject.location.y += this.gridSize;
        cloneObject.isLock = false;
        if (this.gameTableMask.parent) this.gameTableMask.parent.appendChild(cloneObject);
        SoundEffect.play(PresetSound.cardPut);
      }
    });
    actions.push({
      name: '削除する', action: () => {
        this.gameTableMask.destroy();
        SoundEffect.play(PresetSound.sweep);
      }
    });
    actions.push(ContextMenuSeparator);
    actions.push({ name: 'オブジェクト作成', action: null, subActions: this.tabletopActionService.makeDefaultContextMenuActions(objectPosition) });
    return actions;
  }

  private showDetail(gameObject: GameTableMask) {
    let coordinate = this.pointerDeviceService.pointers[0];
    let title = 'マップマスク設定';
    if (gameObject.name.length) title += ' - ' + gameObject.name;
    let option: PanelOption = { title: title, left: coordinate.x - 200, top: coordinate.y - 150, width: 400, height: 340 };
    let component = this.panelService.open<GameCharacterSheetComponent>(GameCharacterSheetComponent, option);
    component.tabletopObject = gameObject;
  }

  private rotateCards(rotate: number) {
    let cards: Card[] = this.tabletopService.cards.filter(card => {
      let tolerance: number = card.size * 50 * 0.2;
      let overlapped: boolean = (this.gameTableMask.location.x < card.location.x + tolerance) && (this.gameTableMask.location.y < card.location.y + tolerance) && (card.location.x + card.size * 50 - tolerance < this.gameTableMask.location.x + this.gameTableMask.width * 50) && (card.location.y + card.size * 75 - tolerance < this.gameTableMask.location.y + this.gameTableMask.height * 50);
      return overlapped;
    });

    if (cards.length == 0) return;

    for (let card of cards) {
      card.rotate = rotate;
    }
  }

  private createStack() {
    let cards: Card[] = this.tabletopService.cards.filter(card => {
      let tolerance: number = card.size * 50 * 0.2;
      let overlapped: boolean = (this.gameTableMask.location.x < card.location.x + tolerance) && (this.gameTableMask.location.y < card.location.y + tolerance) && (card.location.x + card.size * 50 - tolerance < this.gameTableMask.location.x + this.gameTableMask.width * 50) && (card.location.y + card.size * 75 - tolerance < this.gameTableMask.location.y + this.gameTableMask.height * 50);
      return overlapped;
    });

    if (cards.length == 0) return;

    cards.sort((a, b) => {
      if (a.zindex < b.zindex) return 1;
      if (a.zindex > b.zindex) return -1;
      return 0;
    });

    let cardStack = CardStack.create('山札');
    cardStack.location.x = cards[0].location.x;
    cardStack.location.y = cards[0].location.y;
    cardStack.posZ = cards[0].posZ;
    cardStack.location.name = cards[0].location.name;
    cardStack.rotate = cards[0].rotate;
    cardStack.zindex = cards[0].zindex;

    for (let card of cards) {
      cardStack.putOnBottom(card);
    }
  }
}
