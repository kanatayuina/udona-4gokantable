import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { GameObject } from './core/synchronize-object/game-object';
import { ObjectStore } from './core/synchronize-object/object-store';
import { EventSystem } from './core/system';
import { Card } from './card';
import { CardStack } from './card-stack';

export class CardSelecter extends GameObject {
  viewCardIdentifier: string = '';

  // GameObject Lifecycle
  onStoreAdded() {
    super.onStoreAdded();
    EventSystem.register(this)
      .on('SELECT_CARD', event => {
        let object = ObjectStore.instance.get(event.data.identifier);
        if (!(object instanceof Card) && !(object instanceof CardStack)) return;
        this.viewCardIdentifier = event.data.identifier;
      })
      .on('STACKED_CARD', event => {
        if (this.viewCardIdentifier === event.data.identifier) {
          this.viewCardIdentifier = null;
        }
      })
      .on('DELETE_GAME_OBJECT', event => {
        if (this.viewCardIdentifier === event.data.identifier) {
          this.viewCardIdentifier = null;
        }
      });
  }

  // GameObject Lifecycle
  onStoreRemoved() {
    super.onStoreRemoved();
    EventSystem.unregister(this);
  }

  get viewCard(): Card | CardStack {
    let card: Card = ObjectStore.instance.get<Card>(this.viewCardIdentifier);
    // if (!card) {
    //   card = ObjectStore.instance.getObjects<Card>(Card)[0];
    //   if (card && (this.viewCardIdentifier.length < 1 || ObjectStore.instance.isDeleted(this.viewCardIdentifier))) {
    //     this.viewCardIdentifier = card.identifier;
    //     EventSystem.trigger('SELECT_CARD', { identifier: card.identifier });
    //   }
    // }
    return card;
  }
}
