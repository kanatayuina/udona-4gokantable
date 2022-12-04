import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';

import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { EventSystem } from '@udonarium/core/system';
import { Card } from '@udonarium/card';
import { CardStack } from '@udonarium/card-stack';
import { CardSelecter } from '@udonarium/card-selecter';

import { ImageService } from 'service/image.service';
import { PanelService } from 'service/panel.service';

@Component({
  selector: 'card-view',
  templateUrl: './card-view.component.html',
  styleUrls: ['./card-view.component.css']
})
export class CardViewComponent implements OnInit, OnDestroy, AfterViewInit {
  get cardImage(): ImageFile {
    return this.imageService.getEmptyOr(this.selectedCard ? this.selectedCard.imageFile : null);
  }
  get hasImage(): boolean { return 0 < this.cardImage?.url.length; }

  get cardSelecter(): CardSelecter { return ObjectStore.instance.get<CardSelecter>('cardSelecter'); }

  selectedCard: Card | CardStack = null;

  //NG2 get isEmpty(): boolean { return this.selectedCard ? false : true; }
  //NG1 get isEmpty(): boolean { return this.cardSelecter ? (this.cardSelecter.viewCard ? false : true) : true; }

  constructor(
    private imageService: ImageService,
    private panelService: PanelService
  ) { }

  ngOnInit() {
    Promise.resolve().then(() => this.panelService.title = 'カードビュー');
    this.selectedCard = this.cardSelecter.viewCard;
    EventSystem.register(this)
      .on('SELECT_CARD', event => {
        let object = ObjectStore.instance.get(event.data.identifier);
        if (!object) return;
        if (!(object instanceof Card) && !(object instanceof CardStack)) return;
        if (!this.selectedCard || (this.selectedCard.identifier != event.data.identifier)) {
          this.selectedCard = object;
          // this.selectedCard = this.cardSelecter.viewCard;
        }
      })
      .on('STACKED_CARD', event => {
        if (this.selectedCard && (this.selectedCard.identifier === event.data.identifier)) {
          this.selectedCard = null;
          // this.selectedCard = this.cardSelecter.viewCard;
        }
      })
      .on('DELETE_GAME_OBJECT', event => {
        if (this.selectedCard && this.selectedCard.identifier === event.data.identifier) {
          this.selectedCard = null;
          // this.selectedCard = this.cardSelecter.viewCard;
        }
      });
  }

  ngAfterViewInit() { }

  ngOnDestroy() {
    EventSystem.unregister(this);
  }
}
