/* ============================================
   sync-queue.js — IndexedDB action queue
   (Page + Service Worker dono use karte hain)

   Page:  <script src="/js/sync-queue.js">  →  window.RKSyncQueue
   SW:    importScripts('/js/sync-queue.js') →  self.RKSyncQueue

   Use: offline hone par cart actions (upsert/delete/clear) yahan queue
   hote hain, online hote hi background sync (sync-cart) inhe replay
   karta hai. IndexedDB origin-scoped hai — localStorage ki tarah SW bhi
   ise padh sakta hai (page ke against nahi).
   ============================================ */
(function (root) {
  "use strict";

  var DB_NAME = "rk-sync";
  var DB_VERSION = 1;
  var STORE = "queue";
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 din se purane entries auto-drop

  function open() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("byTag", "tag", { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function enqueue(tag, payload) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        var store = tx.objectStore(STORE);
        // Purge stale entries (queue growth bounded rakho)
        var purge = store.openCursor();
        purge.onsuccess = function () {
          var cursor = purge.result;
          if (cursor) {
            if (cursor.value.ts && Date.now() - cursor.value.ts > MAX_AGE_MS) cursor.delete();
            cursor["continue"]();
          }
        };
        store.add({ tag: tag, payload: payload, ts: Date.now() });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function list(tag) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var store = tx.objectStore(STORE);
        var req = store.index("byTag").getAll(tag);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function remove(id) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function update(id, patch) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        var store = tx.objectStore(STORE);
        var getReq = store.get(id);
        getReq.onsuccess = function () {
          var rec = getReq.result;
          if (rec) {
            rec.payload = Object.assign({}, rec.payload, patch);
            store.put(rec);
          }
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  root.RKSyncQueue = {
    enqueue: enqueue,
    list: list,
    remove: remove,
    update: update,
  };
})(typeof self !== "undefined" ? self : this);
