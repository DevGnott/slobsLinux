// This service handles listening to keypresses
// with node-libuiohook.  This is a super simple
// service, and really just serves to ensure that
// the module is required properly and to define
// a typed interface around it.

import { Service } from './core/service';
import * as remote from '@electron/remote';
import { getOS, OS } from 'util/operating-systems';

export type TKeyEventType = 'registerKeydown' | 'registerKeyup';

export interface IKeyBinding {
  callback?: () => void;
  eventType: TKeyEventType;
  key: string; // Is key code
  modifiers: {
    alt: boolean;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
  };
}

/**
 * Node libuiohook is a native addon for binding global hotkeys
 */
interface INodeLibuiohook {
  registerCallback(binding: IKeyBinding): boolean;
  unregisterCallback(binding: IKeyBinding): void;
  unregisterAllCallbacks(): void;
  startHook(): void;
  stopHook(): void;
}

export class KeyListenerService extends Service {
  private libuiohook: INodeLibuiohook;

  // key -> namepsace -> function
  bindings: Dictionary<Dictionary<IKeyBinding>> = {};

  hookStarted = false;

  init() {
    try {
      this.libuiohook = remote.require('node-libuiohook');
    } catch (e: unknown) {
      // node-libuiohook has no Linux build yet. All hotkeys go through it, so
      // hotkeys are disabled until it is built for Linux.
      if (getOS() !== OS.Linux) throw e;
      console.warn('node-libuiohook is not available, hotkeys are disabled', e);
      this.libuiohook = {
        registerCallback: () => false,
        unregisterCallback: () => {},
        unregisterAllCallbacks: () => {},
        startHook: () => {},
        stopHook: () => {},
      };
    }
  }

  unregisterAll(namespace = 'global') {
    Object.keys(this.bindings).forEach(keystr => {
      if (this.bindings[keystr][namespace]) {
        this.unregister(this.bindings[keystr][namespace], namespace);
      }
    });
  }

  register(binding: IKeyBinding, namespace = 'global') {
    if (!this.hookStarted) {
      this.libuiohook.startHook();
      this.hookStarted = true;
    }

    // An empty string is not valid
    if (!binding.key) return;
    const keystr = this.getKeyString(binding);

    // If no other namespaces have bound this key, create a new key object
    // and binding it with libuiohook.
    if (!this.bindings[keystr]) {
      const success = this.libuiohook.registerCallback({
        ...binding,
        callback: () => {
          Object.keys(this.bindings[keystr]).forEach(namespace => {
            this.bindings[keystr][namespace].callback();
          });
        },
      });

      if (!success) return;

      this.bindings[keystr] = {};
    }

    this.bindings[keystr][namespace] = binding;

    return true;
  }

  unregister(binding: IKeyBinding, namespace = 'global') {
    const keystr = this.getKeyString(binding);
    delete this.bindings[keystr][namespace];
    if (Object.keys(this.bindings[keystr]).length === 0) {
      delete this.bindings[keystr];
      this.libuiohook.unregisterCallback(binding);
    }
  }

  shutdown() {
    if (this.hookStarted) {
      this.libuiohook.unregisterAllCallbacks();
      this.libuiohook.stopHook();
    }
  }

  // Returns a string used for fast lookup of this keybinding
  private getKeyString(binding: IKeyBinding) {
    return (
      `${binding.key}-${binding.eventType}-${!!binding.modifiers.alt}-` +
      `${!!binding.modifiers.ctrl}-${!!binding.modifiers.shift}-${!!binding.modifiers.meta}`
    );
  }
}
