/**
 * Firebase 設定（Realtime Database / Authentication）
 * 本番用の設定は環境に合わせて差し替えてください。
 */
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyCpac2o2I16Md19uAMelMsNVzJJlvEPUp0",
    authDomain: "skd-404.firebaseapp.com",
    databaseURL: "https://skd-404-default-rtdb.firebaseio.com",
    projectId: "skd-404",
    storageBucket: "skd-404.firebasestorage.app",
    messagingSenderId: "368199431101",
    appId: "1:368199431101:web:51105f7de7ec4c66c2d8d4",
    measurementId: "G-8SRY5ZK6CV"
  };

  if (typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    window.firebaseDb = firebase.database();
    window.firebaseAuth = firebase.auth();
  }
})();
