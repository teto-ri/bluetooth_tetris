/* Copyright 2021 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

/**
 * File bleManager.js - handles communcation between webpage and Arduino
 * including transfering of models
 * @author Rikard Lindstrom
 */

class EventHandler {
    constructor(...eventNames) {
      this.eventListeners = {};
      this.propagation = [];
      eventNames.forEach((eventName) => {
        this.addEventName(eventName);
      });
    }
  
    _checkEvent(eventName){
      if (!this.eventListeners[eventName]) {
        throw new Error(
          `No event named ${eventName}. Availible events are ${Object.keys(
            this.eventListeners
          ).join(', ')}`
        );
      }
    }
  
    addEventListener(eventName, callback) {
      this._checkEvent(eventName);
      this.eventListeners[eventName].push(callback);
      return ()=>{
        this.removeEventListener(eventName, callback);
      }
    }
  
    removeEventListener(eventName, callback) {
      this._checkEvent(eventName);
      this.eventListeners[eventName] = this.eventListeners[eventName].filter(
        (cb) => cb !== callback
      );
    }
  
    once(eventName, callback){
      const unsub = this.addEventListener(eventName, (...args)=>{
        callback(...args);
        unsub();
      });
    }
  
    dispatchEvent(eventName, data) {
      this._checkEvent(eventName);
      this.eventListeners[eventName].forEach((cb) => cb(data));
      this.propagation.forEach(listener=>listener.dispatchEvent(eventName, data));
    }
  
    addEventName(name){
      this.eventListeners[name] = this.eventListeners[name] || [];
    }
    
    propagateTo(eventHandler){
      this.propagation.push(eventHandler);
      Object.keys(this.eventListeners).forEach((name)=>eventHandler.addEventName(name));
    }
}

/********************************************************************
 * Colorized Logging
 *******************************************************************/

const log = (...args) => {
  console.log(
    "%c -> bleManager.js " + args.join(", "),
    "background: DarkOliveGreen; color: #F0F2F6; display: block;"
  );
};

/********************************************************************
 * BLE UUIDS
 *******************************************************************/

const SERVICE_UUID              = 0x00FF;
const INFERENCE_RX_UUID         = 0xFF04;

/********************************************************************
 * Service / characteristics
 *******************************************************************/

let service;
let device;

// Characteristics
let inferenceRxChar;

// Keep track of connection
let isConnected = false;

const eventHandler = new EventHandler(
  "inference"
);

let inferecedResult = -1;     //추론 결과
const bluetoothButton = document.getElementById("bluetoothButton");
/********************************************************************
 * Methods
 *******************************************************************/

function handleInferenceChange(event) {
  const value = new Uint8Array(event.target.value.buffer);
  const inferecedResult = value[0];
  console.log(inferecedResult);

  // 'inference' 이벤트를 생성하고, 커스텀 데이터를 포함하여 전달
  const inferenceEvent = new CustomEvent('inference', { detail: { index: inferecedResult } });
  document.dispatchEvent(inferenceEvent);
}

function onDisconnected(event) {
  eventHandler.dispatchEvent("disconnect");
  isConnected = false;
}

async function connect() {
  log("Requesting device ...");

  device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
  });

  log("Connecting to device ...");

  device.addEventListener("gattserverdisconnected", onDisconnected);

  const server = await device.gatt.connect();

  log("Getting primary service ...");
  service = await server.getPrimaryService(SERVICE_UUID);
}

const bleManagerApi = {
  async connect() {
  
    await connect();
    console.log('SETUP CONNECT!');
    inferenceRxChar         = await service.getCharacteristic(INFERENCE_RX_UUID);
    console.log("Complete getCharacteristic!");

    await inferenceRxChar.startNotifications();
    inferenceRxChar.addEventListener(
      "characteristicvaluechanged",
      handleInferenceChange
    );
    console.log("Start Notification: inference");

    isConnected = true;
  },

  async disconnect() {
    console.log("disconnected");
    await device.gatt.disconnect()
  },

  addEventListener(...args) {
    return eventHandler.addEventListener(...args);
  },

  removeEventListener(...args) {
    return eventHandler.removeEventListener(...args);
  },

  once(...args){
    return eventHandler.once(...args);
  },

  propagateEventsTo(_eventHandler) {
    eventHandler.propagateTo(_eventHandler);
  },
};

bluetoothButton.addEventListener("click", async () => {
    try {
        await bleManagerApi.connect();
    } catch (error) {
        console.error("Bluetooth 장치 요청 오류:", error);
    }
});