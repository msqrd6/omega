/* ==============================================================
   network.js: PeerJS (WebRTC / P2P) オンライン対戦通信マネージャー
   ============================================================== */

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null;         // 'P1' (ホスト) or 'P2' (ゲスト) or null
    this.roomId = null;
    this.isConnected = false;

    // コールバック
    this.onStatusChange = null; // (statusText, isError) => void
    this.onConnected = null;    // (role) => void
    this.onMessage = null;      // (data) => void
    this.onDisconnected = null; // () => void
  }

  // ランダムな短いルームID（例: omega-7a3b）を生成
  generateRoomId() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let rand = '';
    for (let i = 0; i < 5; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `omega-${rand}`;
  }

  // 招待URLの取得
  getInviteUrl(roomId) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    return url.toString();
  }

  // ホストとして部屋を作成
  createRoom() {
    return new Promise((resolve, reject) => {
      this.close();

      if (typeof window.Peer === 'undefined') {
        const err = new Error('PeerJS ライブラリが読み込まれていません。インターネット接続を確認してください。');
        if (this.onStatusChange) this.onStatusChange(err.message, true);
        return reject(err);
      }

      this.roomId = this.generateRoomId();
      this.role = 'P1';

      if (this.onStatusChange) this.onStatusChange('通信サーバーに接続中...', false);

      try {
        // PeerJS クラウドシグナリングサーバーへ接続
        this.peer = new window.Peer(this.roomId, {
          debug: 1
        });

        this.peer.on('open', (id) => {
          this.roomId = id;
          if (this.onStatusChange) {
            this.onStatusChange('待機中: 相手に合言葉またはURLを共有してください', false);
          }
          resolve(id);
        });

        this.peer.on('connection', (conn) => {
          // ゲストからの接続を受信
          if (this.conn) {
            // すでに接続がある場合は拒否（1対1対戦）
            conn.close();
            return;
          }
          this._setupConnection(conn, 'P1');
        });

        this.peer.on('error', (err) => {
          console.error('[PeerJS Error]', err);
          let msg = `通信エラー: ${err.type || err.message}`;
          if (err.type === 'unavailable-id') {
            msg = 'ルームIDが既に使用されています。再試行してください。';
          }
          if (this.onStatusChange) this.onStatusChange(msg, true);
          reject(err);
        });

      } catch (e) {
        if (this.onStatusChange) this.onStatusChange(`接続エラー: ${e.message}`, true);
        reject(e);
      }
    });
  }

  // ゲストとして部屋に参加
  joinRoom(targetRoomId) {
    return new Promise((resolve, reject) => {
      this.close();

      if (!targetRoomId || targetRoomId.trim() === '') {
        const err = new Error('合言葉 (Room ID) を入力してください。');
        if (this.onStatusChange) this.onStatusChange(err.message, true);
        return reject(err);
      }

      if (typeof window.Peer === 'undefined') {
        const err = new Error('PeerJS ライブラリが読み込まれていません。');
        if (this.onStatusChange) this.onStatusChange(err.message, true);
        return reject(err);
      }

      this.role = 'P2';
      const cleanId = targetRoomId.trim();

      if (this.onStatusChange) this.onStatusChange('ホストへ接続を要求中...', false);

      try {
        this.peer = new window.Peer({
          debug: 1
        });

        this.peer.on('open', () => {
          const conn = this.peer.connect(cleanId, {
            reliable: true
          });
          this._setupConnection(conn, 'P2');
          resolve(cleanId);
        });

        this.peer.on('error', (err) => {
          console.error('[PeerJS Error]', err);
          let msg = `接続エラー: ${err.type || err.message}`;
          if (err.type === 'peer-unavailable') {
            msg = '部屋が見つかりません。合言葉が正しいか確認してください。';
          }
          if (this.onStatusChange) this.onStatusChange(msg, true);
          reject(err);
        });

      } catch (e) {
        if (this.onStatusChange) this.onStatusChange(`接続エラー: ${e.message}`, true);
        reject(e);
      }
    });
  }

  // コネクションのセットアップ共通処理
  _setupConnection(conn, role) {
    this.conn = conn;

    conn.on('open', () => {
      this.isConnected = true;
      if (this.onStatusChange) {
        this.onStatusChange(`🎉 対戦相手と接続しました！（あなたは ${role === 'P1' ? 'BLUE (先行)' : 'RED (後攻)'} です）`, false);
      }
      if (this.onConnected) {
        this.onConnected(role);
      }
    });

    conn.on('data', (data) => {
      if (this.onMessage) {
        this.onMessage(data);
      }
    });

    conn.on('close', () => {
      this.isConnected = false;
      this.conn = null;
      if (this.onStatusChange) {
        this.onStatusChange('⚠️ 対戦相手との通信が切断されました。', true);
      }
      if (this.onDisconnected) {
        this.onDisconnected();
      }
    });

    conn.on('error', (err) => {
      console.error('[Connection Error]', err);
      if (this.onStatusChange) {
        this.onStatusChange(`通信障害: ${err.message}`, true);
      }
    });
  }

  // アクション/メッセージの送信
  send(type, payload = {}) {
    if (!this.conn || !this.isConnected) {
      console.warn('[Network] 送信できません: 未接続です', type, payload);
      return false;
    }
    const message = {
      type,
      payload,
      sender: this.role,
      timestamp: Date.now()
    };
    try {
      this.conn.send(message);
      return true;
    } catch (e) {
      console.error('[Network Send Error]', e);
      return false;
    }
  }

  // 接続を閉じる
  close() {
    this.isConnected = false;
    this.role = null;
    this.roomId = null;
    if (this.conn) {
      try { this.conn.close(); } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
  }
}

export const network = new NetworkManager();
