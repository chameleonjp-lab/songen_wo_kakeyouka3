const interfaceKeys = [
  "intro", "prepare", "register", "name", "face", "create", "roomId", "copy", "enter",
  "lobby", "ready", "home", "player", "you", "waiting", "waitingReady", "connecting",
  "reconnecting", "paused", "forfeit", "confirmForfeit", "announcement", "toScore", "scoreTitle",
  "return", "attack", "guard", "left", "right", "stamina", "selectFace"
];

const statusKeys = [
  "invalidCode", "copied", "copyFailed", "full", "expired", "version", "network", "credentials",
  "rate_limit", "unavailable", "disconnected", "opponentLeft", "conflict", "invalid",
  "heart", "double-heart", "timeout", "forfeitReason", "interrupted", "rankingPending"
];

const shareKeys = ["scoreText"];

const interfaceText = {
  ja: [
    "尊厳を賭けるのに距離なんて関係ない！", "ゲームの準備(オンライン対戦)", "プレイヤー登録", "プレイヤー名（任意）", "顔を選ぶ",
    "ルームを立てる", "ルームID", "IDをコピー", "待機室へ", "待機室", "準備完了", "ホーム", "プレイヤー{p0}", "あなた",
    "相手を待っています", "二人が準備完了すると対戦が始まります", "接続しています…", "再接続しています…",
    "対戦を一時停止しました。接続の復帰を待っています（残り{p0}秒）", "降参", "降参すると相手の勝ちになります。降参しますか？",
    "結果発表", "スコア結果へ", "スコア結果", "ルームに戻る", "拳", "ガード", "左に移動", "右に移動", "スタミナ", "顔 {p0}"
  ],
  en: [
    "Distance means nothing when dignity is on the line!", "Set up game (online match)", "Player registration", "Player name (optional)", "Choose a face",
    "Create a room", "Room ID", "Copy ID", "Enter lobby", "Lobby", "Ready", "Home", "Player {p0}", "You",
    "Waiting for your opponent", "The match starts when both players are ready", "Connecting…", "Reconnecting…",
    "Match paused. Waiting for reconnection ({p0}s left)", "Surrender", "Your opponent wins if you surrender. Surrender now?",
    "Match result", "View score", "Score result", "Return to room", "Punch", "Guard", "Move left", "Move right", "Stamina", "Face {p0}"
  ],
  es: [
    "¡La distancia no importa cuando te juegas la dignidad!", "Preparar partida (en línea)", "Registro de jugador", "Nombre (opcional)", "Elige una cara",
    "Crear sala", "ID de sala", "Copiar ID", "Ir a la sala de espera", "Sala de espera", "Listo", "Inicio", "Jugador {p0}", "Tú",
    "Esperando al rival", "La partida comienza cuando ambos estén listos", "Conectando…", "Reconectando…",
    "Partida en pausa. Esperando reconexión (quedan {p0} s)", "Rendirse", "Si te rindes, tu rival gana. ¿Te rindes?",
    "Resultado de la partida", "Ver puntuación", "Puntuación final", "Volver a la sala", "Puño", "Bloqueo", "Mover a la izquierda", "Mover a la derecha", "Resistencia", "Cara {p0}"
  ],
  "pt-BR": [
    "A distância não importa quando a dignidade está em jogo!", "Preparar partida (online)", "Cadastro de jogador", "Nome (opcional)", "Escolha um rosto",
    "Criar sala", "ID da sala", "Copiar ID", "Entrar na sala de espera", "Sala de espera", "Pronto", "Início", "Jogador {p0}", "Você",
    "Aguardando o adversário", "A partida começa quando os dois estiverem prontos", "Conectando…", "Reconectando…",
    "Partida pausada. Aguardando reconexão (faltam {p0} s)", "Desistir", "Se você desistir, o adversário ganha. Quer desistir?",
    "Resultado da partida", "Ver pontuação", "Pontuação final", "Voltar à sala", "Soco", "Defesa", "Mover à esquerda", "Mover à direita", "Energia", "Rosto {p0}"
  ],
  "zh-Hans": [
    "赌上尊严，距离根本不是问题！", "准备游戏（在线对战）", "玩家登记", "玩家名（选填）", "选择头像", "创建房间", "房间 ID", "复制 ID", "进入等候室",
    "等候室", "准备就绪", "首页", "玩家 {p0}", "你", "正在等待对手", "双方准备就绪后开始对战", "正在连接…", "正在重新连接…",
    "对战已暂停，等待重新连接（剩余 {p0} 秒）", "认输", "认输后对手获胜。确定认输吗？", "对战结果", "查看得分", "得分结果", "返回房间", "出拳", "格挡", "向左移动", "向右移动", "体力", "头像 {p0}"
  ],
  fr: [
    "La distance ne compte pas quand la dignité est en jeu !", "Préparer la partie (en ligne)", "Inscription du joueur", "Nom (facultatif)", "Choisir un visage",
    "Créer un salon", "Identifiant du salon", "Copier l’identifiant", "Entrer en salle d’attente", "Salle d’attente", "Prêt", "Accueil", "Joueur {p0}", "Toi",
    "En attente de ton adversaire", "La partie commence quand les deux joueurs sont prêts", "Connexion…", "Reconnexion…",
    "Partie en pause. En attente de reconnexion (reste {p0} s)", "Abandonner", "Ton adversaire gagne si tu abandonnes. Abandonner ?",
    "Résultat de la partie", "Voir le score", "Score final", "Retour au salon", "Poing", "Garde", "Aller à gauche", "Aller à droite", "Endurance", "Visage {p0}"
  ],
  de: [
    "Entfernung spielt keine Rolle, wenn die Würde auf dem Spiel steht!", "Spiel vorbereiten (online)", "Spieleranmeldung", "Spielername (optional)", "Gesicht wählen",
    "Raum erstellen", "Raum-ID", "ID kopieren", "Zum Warteraum", "Warteraum", "Bereit", "Startseite", "Spieler {p0}", "Du",
    "Warte auf deinen Gegner", "Das Spiel beginnt, sobald beide bereit sind", "Verbindung wird hergestellt…", "Verbindung wird wiederhergestellt…",
    "Spiel pausiert. Warte auf die Wiederverbindung (noch {p0} s)", "Aufgeben", "Wenn du aufgibst, gewinnt dein Gegner. Wirklich aufgeben?",
    "Spielergebnis", "Punktzahl ansehen", "Endpunktzahl", "Zurück zum Raum", "Faust", "Blocken", "Nach links bewegen", "Nach rechts bewegen", "Ausdauer", "Gesicht {p0}"
  ],
  ko: [
    "존엄을 거는 데 거리는 상관없다!", "게임 준비 (온라인 대전)", "플레이어 등록", "플레이어 이름 (선택)", "얼굴 고르기", "방 만들기", "방 ID",
    "ID 복사", "대기실 입장", "대기실", "준비 완료", "홈", "플레이어 {p0}", "나", "상대를 기다리는 중", "두 사람 모두 준비하면 대전이 시작됩니다",
    "연결 중…", "다시 연결 중…", "대전을 일시 정지했습니다. 연결 대기 중 ({p0}초 남음)", "항복", "항복하면 상대가 승리합니다. 항복할까요?",
    "대전 결과", "점수 보기", "점수 결과", "방으로 돌아가기", "주먹", "방어", "왼쪽으로 이동", "오른쪽으로 이동", "체력", "얼굴 {p0}"
  ],
  ru: [
    "Расстояние не имеет значения, когда на кону достоинство!", "Подготовить игру (онлайн)", "Регистрация игрока", "Имя (необязательно)", "Выбрать лицо",
    "Создать комнату", "Код комнаты", "Копировать код", "Войти в зал ожидания", "Зал ожидания", "Готов", "Главная", "Игрок {p0}", "Вы",
    "Ожидание соперника", "Матч начнётся, когда оба игрока будут готовы", "Подключение…", "Переподключение…",
    "Матч приостановлен. Ждём подключения (осталось {p0} с)", "Сдаться", "Если вы сдадитесь, соперник победит. Сдаться?",
    "Итоги матча", "Посмотреть очки", "Итоговые очки", "Вернуться в комнату", "Удар", "Блок", "Двигаться влево", "Двигаться вправо", "Выносливость", "Лицо {p0}"
  ],
  it: [
    "La distanza non conta quando è in gioco la dignità!", "Prepara la partita (online)", "Registrazione giocatore", "Nome (facoltativo)", "Scegli un volto",
    "Crea una stanza", "ID stanza", "Copia ID", "Entra in sala d’attesa", "Sala d’attesa", "Pronto", "Home", "Giocatore {p0}", "Tu",
    "In attesa dell’avversario", "La partita inizia quando entrambi sono pronti", "Connessione…", "Riconnessione…",
    "Partita in pausa. In attesa della riconnessione (restano {p0} s)", "Arrenditi", "Se ti arrendi, vince l’avversario. Arrendersi?",
    "Risultato della partita", "Vedi punteggio", "Punteggio finale", "Torna alla stanza", "Pugno", "Parata", "Vai a sinistra", "Vai a destra", "Resistenza", "Volto {p0}"
  ],
  "zh-Hant": [
    "賭上尊嚴，距離根本不是問題！", "準備遊戲（線上對戰）", "玩家登記", "玩家名稱（選填）", "選擇頭像", "建立房間", "房間 ID", "複製 ID", "進入等候室",
    "等候室", "準備就緒", "首頁", "玩家 {p0}", "你", "正在等候對手", "雙方準備就緒後開始對戰", "正在連線…", "正在重新連線…",
    "對戰已暫停，等候重新連線（剩餘 {p0} 秒）", "認輸", "認輸後對手獲勝。確定認輸嗎？", "對戰結果", "查看分數", "分數結果", "返回房間", "出拳", "格擋", "向左移動", "向右移動", "體力", "頭像 {p0}"
  ],
  id: [
    "Jarak tak berarti saat harga diri dipertaruhkan!", "Siapkan pertandingan (daring)", "Pendaftaran pemain", "Nama (opsional)", "Pilih wajah",
    "Buat ruang", "ID ruang", "Salin ID", "Masuk ruang tunggu", "Ruang tunggu", "Siap", "Beranda", "Pemain {p0}", "Kamu",
    "Menunggu lawan", "Pertandingan dimulai saat kedua pemain siap", "Menghubungkan…", "Menghubungkan kembali…",
    "Pertandingan dijeda. Menunggu sambungan (sisa {p0} dtk)", "Menyerah", "Lawan menang jika kamu menyerah. Mau menyerah?",
    "Hasil pertandingan", "Lihat skor", "Skor akhir", "Kembali ke ruang", "Pukul", "Tangkis", "Bergerak ke kiri", "Bergerak ke kanan", "Stamina", "Wajah {p0}"
  ],
  tr: [
    "Onurun söz konusuysa mesafenin önemi yok!", "Oyunu hazırla (çevrimiçi maç)", "Oyuncu kaydı", "Oyuncu adı (isteğe bağlı)", "Yüz seç",
    "Oda oluştur", "Oda kodu", "Kodu kopyala", "Bekleme odasına gir", "Bekleme odası", "Hazır", "Ana sayfa", "Oyuncu {p0}", "Sen",
    "Rakip bekleniyor", "İki oyuncu da hazır olunca maç başlar", "Bağlanıyor…", "Yeniden bağlanıyor…",
    "Maç duraklatıldı. Bağlantı bekleniyor ({p0} sn kaldı)", "Pes et", "Pes edersen rakibin kazanır. Pes etmek istiyor musun?",
    "Maç sonucu", "Skoru gör", "Son skor", "Odaya dön", "Yumruk", "Savunma", "Sola hareket et", "Sağa hareket et", "Dayanıklılık", "Yüz {p0}"
  ],
  vi: [
    "Khi danh dự bị đặt cược, khoảng cách chẳng là gì!", "Chuẩn bị đấu (trực tuyến)", "Đăng ký người chơi", "Tên (không bắt buộc)", "Chọn khuôn mặt",
    "Tạo phòng", "Mã phòng", "Sao chép mã", "Vào phòng chờ", "Phòng chờ", "Sẵn sàng", "Trang chủ", "Người chơi {p0}", "Bạn",
    "Đang chờ đối thủ", "Trận đấu bắt đầu khi cả hai đã sẵn sàng", "Đang kết nối…", "Đang kết nối lại…",
    "Trận đấu tạm dừng. Đang chờ kết nối lại (còn {p0} giây)", "Đầu hàng", "Nếu bạn đầu hàng, đối thủ sẽ thắng. Bạn muốn đầu hàng?",
    "Kết quả trận đấu", "Xem điểm", "Điểm cuối trận", "Quay lại phòng", "Đấm", "Đỡ đòn", "Di chuyển sang trái", "Di chuyển sang phải", "Thể lực", "Khuôn mặt {p0}"
  ],
  th: [
    "เมื่อศักดิ์ศรีเป็นเดิมพัน ระยะทางก็ไม่สำคัญ!", "เตรียมเกม (แข่งออนไลน์)", "ลงทะเบียนผู้เล่น", "ชื่อผู้เล่น (ไม่บังคับ)", "เลือกใบหน้า",
    "สร้างห้อง", "รหัสห้อง", "คัดลอกรหัส", "เข้าห้องรอ", "ห้องรอ", "พร้อม", "หน้าหลัก", "ผู้เล่น {p0}", "คุณ",
    "กำลังรอคู่ต่อสู้", "เกมจะเริ่มเมื่อทั้งสองคนพร้อม", "กำลังเชื่อมต่อ…", "กำลังเชื่อมต่อใหม่…",
    "หยุดเกมชั่วคราว กำลังรอการเชื่อมต่อใหม่ (เหลือ {p0} วิ)", "ยอมแพ้", "ถ้าคุณยอมแพ้ คู่ต่อสู้จะชนะ ต้องการยอมแพ้ไหม",
    "ผลการแข่งขัน", "ดูคะแนน", "คะแนนสุดท้าย", "กลับไปที่ห้อง", "ต่อย", "ป้องกัน", "ไปทางซ้าย", "ไปทางขวา", "พลัง", "ใบหน้า {p0}"
  ]
};

const statusText = {
  ja: [
    "4桁のルームIDを入力してください。", "ルームIDをコピーしました。", "コピーできませんでした。IDを選択してコピーしてください。", "このルームは満員です。",
    "ルームの有効期限が切れました。", "ゲームの版が異なります。画面を再読み込みしてください。", "通信できませんでした。接続を確認してください。",
    "この席には接続できません。", "少し待ってからもう一度お試しください。", "ただいま新しいルームを作れません。",
    "接続が切れました。", "相手が退出しました。", "もう一度お試しください。", "入力した内容を確認してください。",
    "心臓への命中", "両者の心臓に同時に命中", "時間切れ", "降参で決着", "通信中断", "ランキングへの反映を待っています。"
  ],
  en: [
    "Enter the 4-digit room ID.", "Room ID copied.", "Couldn’t copy the ID. Select and copy it manually.", "This room is full.",
    "This room has expired.", "Game versions differ. Reload this page.", "Couldn’t connect. Check your connection.", "Couldn’t access this seat.",
    "Wait a moment and try again.", "New rooms are temporarily unavailable.", "Connection lost.", "Your opponent left.", "Please try again.", "Check what you entered.",
    "Heart hit", "Both hearts hit at the same time", "Time ran out", "Match ended by surrender", "Connection interrupted", "Waiting for the leaderboard to update."
  ],
  es: [
    "Introduce el ID de sala de 4 dígitos.", "ID de sala copiado.", "No se pudo copiar el ID. Selecciónalo y cópialo manualmente.", "La sala está llena.",
    "La sala ha caducado.", "Las versiones del juego son distintas. Recarga la página.", "No se pudo conectar. Revisa la conexión.", "No se pudo acceder a esta plaza.",
    "Espera un momento e inténtalo de nuevo.", "Por ahora no se pueden crear salas.", "Se perdió la conexión.", "Tu rival salió.", "Inténtalo de nuevo.", "Revisa los datos introducidos.",
    "Golpe al corazón", "Ambos corazones golpeados a la vez", "Se agotó el tiempo", "Partida decidida por rendición", "Conexión interrumpida", "Esperando la actualización de la clasificación."
  ],
  "pt-BR": [
    "Digite o ID de sala de 4 dígitos.", "ID da sala copiado.", "Não foi possível copiar o ID. Selecione e copie manualmente.", "A sala está lotada.",
    "O prazo da sala expirou.", "As versões do jogo são diferentes. Recarregue a página.", "Não foi possível conectar. Verifique sua conexão.", "Não foi possível acessar esta vaga.",
    "Aguarde um pouco e tente novamente.", "A criação de salas está indisponível no momento.", "Conexão perdida.", "Seu adversário saiu.", "Tente novamente.", "Confira o que foi digitado.",
    "Golpe no coração", "Os dois corações foram atingidos ao mesmo tempo", "Tempo esgotado", "Partida decidida por desistência", "Conexão interrompida", "Aguardando a atualização do ranking."
  ],
  "zh-Hans": [
    "请输入 4 位数字的房间 ID。", "已复制房间 ID。", "无法自动复制，请选中 ID 后手动复制。", "房间已满。",
    "房间已过期。", "游戏版本不同，请重新加载此页面。", "无法连接，请检查网络。", "无法连接到此席位。",
    "请稍等后再试。", "暂时无法创建新房间。", "连接已断开。", "对手已退出。", "请重试。", "请检查输入内容。",
    "心脏被击中", "双方心脏同时被击中", "时间到", "对战因认输结束", "连接中断", "正在等待排行榜更新。"
  ],
  fr: [
    "Saisis le code du salon à 4 chiffres.", "Identifiant du salon copié.", "Copie impossible. Sélectionne et copie l’identifiant manuellement.", "Ce salon est complet.",
    "Ce salon a expiré.", "Les versions du jeu diffèrent. Recharge cette page.", "Connexion impossible. Vérifie ta connexion.", "Impossible d’accéder à cette place.",
    "Attends un instant et réessaie.", "La création de salons est momentanément indisponible.", "Connexion perdue.", "Ton adversaire a quitté la partie.", "Réessaie.", "Vérifie ta saisie.",
    "Coup au cœur", "Les deux cœurs ont été touchés en même temps", "Temps écoulé", "Partie terminée par un abandon", "Connexion interrompue", "En attente de la mise à jour du classement."
  ],
  de: [
    "Gib die vierstellige Raum-ID ein.", "Raum-ID kopiert.", "Kopieren fehlgeschlagen. Markiere und kopiere die ID von Hand.", "Dieser Raum ist voll.",
    "Dieser Raum ist abgelaufen.", "Die Spielversionen unterscheiden sich. Lade die Seite neu.", "Verbindung fehlgeschlagen. Prüfe deine Verbindung.", "Dieser Platz ist nicht zugänglich.",
    "Warte kurz und versuche es erneut.", "Neue Räume sind vorübergehend nicht verfügbar.", "Verbindung getrennt.", "Dein Gegner hat den Raum verlassen.", "Versuche es erneut.", "Prüfe deine Eingabe.",
    "Treffer ins Herz", "Beide Herzen wurden gleichzeitig getroffen", "Zeit abgelaufen", "Spiel durch Aufgabe beendet", "Verbindung unterbrochen", "Warte auf die Aktualisierung der Rangliste."
  ],
  ko: [
    "4자리 방 ID를 입력하세요.", "방 ID를 복사했습니다.", "복사하지 못했습니다. ID를 선택해서 직접 복사하세요.", "방이 가득 찼습니다.",
    "방 이용 시간이 끝났습니다.", "게임 버전이 다릅니다. 페이지를 새로고침하세요.", "연결하지 못했습니다. 네트워크를 확인하세요.", "이 자리에 연결할 수 없습니다.",
    "잠시 후 다시 시도하세요.", "지금은 새 방을 만들 수 없습니다.", "연결이 끊겼습니다.", "상대가 나갔습니다.", "다시 시도하세요.", "입력 내용을 확인하세요.",
    "심장 명중", "양쪽 심장에 동시 명중", "시간 초과", "항복으로 종료", "연결 중단", "순위표가 업데이트되기를 기다리는 중입니다."
  ],
  ru: [
    "Введите 4 цифры кода комнаты.", "Код комнаты скопирован.", "Не удалось скопировать код. Выделите и скопируйте его вручную.", "Комната заполнена.",
    "Срок действия комнаты истёк.", "Версии игры различаются. Обновите страницу.", "Не удалось подключиться. Проверьте соединение.", "Не удалось занять это место.",
    "Немного подождите и повторите попытку.", "Создание комнат временно недоступно.", "Связь потеряна.", "Соперник вышел.", "Повторите попытку.", "Проверьте введённые данные.",
    "Удар в сердце", "Оба сердца поражены одновременно", "Время вышло", "Матч завершён сдачей", "Связь прервана", "Ожидаем обновления таблицы лидеров."
  ],
  it: [
    "Inserisci l’ID di 4 cifre della stanza.", "ID della stanza copiato.", "Copia non riuscita. Seleziona e copia l’ID manualmente.", "La stanza è piena.",
    "Questa stanza è scaduta.", "Le versioni del gioco sono diverse. Ricarica la pagina.", "Impossibile connettersi. Controlla la connessione.", "Impossibile accedere a questo posto.",
    "Attendi un istante e riprova.", "La creazione di nuove stanze è temporaneamente sospesa.", "Connessione persa.", "L’avversario è uscito.", "Riprova.", "Controlla ciò che hai inserito.",
    "Colpo al cuore", "Entrambi i cuori colpiti nello stesso momento", "Tempo scaduto", "Partita conclusa per resa", "Connessione interrotta", "In attesa dell’aggiornamento della classifica."
  ],
  "zh-Hant": [
    "請輸入 4 位數的房間 ID。", "已複製房間 ID。", "無法自動複製，請選取 ID 後手動複製。", "房間已滿。",
    "房間已過期。", "遊戲版本不同，請重新載入此頁面。", "無法連線，請檢查網路。", "無法連線至此席位。",
    "請稍等後再試。", "暫時無法建立新房間。", "連線已中斷。", "對手已離開。", "請再試一次。", "請檢查輸入內容。",
    "心臟被擊中", "雙方心臟同時被擊中", "時間到", "對戰因認輸結束", "連線中斷", "正在等候排行榜更新。"
  ],
  id: [
    "Masukkan ID ruang 4 digit.", "ID ruang disalin.", "ID gagal disalin. Pilih dan salin ID secara manual.", "Ruang ini penuh.",
    "Ruang ini kedaluwarsa.", "Versi permainan berbeda. Muat ulang halaman.", "Tidak dapat terhubung. Periksa sambungan.", "Tempat ini tidak dapat diakses.",
    "Tunggu sebentar lalu coba lagi.", "Pembuatan ruang baru sedang tidak tersedia.", "Sambungan terputus.", "Lawan keluar.", "Silakan coba lagi.", "Periksa isianmu.",
    "Jantung terkena pukulan", "Kedua jantung terkena bersamaan", "Waktu habis", "Pertandingan berakhir karena menyerah", "Sambungan terputus", "Menunggu pembaruan papan peringkat."
  ],
  tr: [
    "4 haneli oda kodunu gir.", "Oda kodu kopyalandı.", "Kod kopyalanamadı. Kodu seçip elle kopyala.", "Bu oda dolu.",
    "Bu odanın süresi doldu.", "Oyun sürümleri farklı. Sayfayı yeniden yükle.", "Bağlanılamadı. Bağlantını kontrol et.", "Bu koltuğa erişilemedi.",
    "Biraz bekleyip yeniden dene.", "Geçici olarak yeni oda oluşturulamıyor.", "Bağlantı kesildi.", "Rakibin ayrıldı.", "Tekrar dene.", "Girdiğin bilgileri kontrol et.",
    "Kalbe isabet", "İki kalp aynı anda vuruldu", "Süre doldu", "Maç pes etme nedeniyle bitti", "Bağlantı kesildi", "Sıralamanın güncellenmesi bekleniyor."
  ],
  vi: [
    "Nhập mã phòng gồm 4 chữ số.", "Đã sao chép mã phòng.", "Không sao chép được. Hãy chọn mã và sao chép thủ công.", "Phòng này đã đầy.",
    "Phòng đã hết hạn.", "Phiên bản trò chơi khác nhau. Hãy tải lại trang.", "Không thể kết nối. Hãy kiểm tra đường truyền.", "Không thể vào vị trí này.",
    "Hãy chờ một lúc rồi thử lại.", "Tạm thời chưa thể tạo phòng mới.", "Đã mất kết nối.", "Đối thủ đã rời đi.", "Hãy thử lại.", "Hãy kiểm tra nội dung đã nhập.",
    "Đánh trúng tim", "Hai trái tim bị đánh trúng cùng lúc", "Hết giờ", "Trận đấu kết thúc do đầu hàng", "Kết nối bị gián đoạn", "Đang chờ bảng xếp hạng cập nhật."
  ],
  th: [
    "ป้อนรหัสห้อง 4 หลัก", "คัดลอกรหัสห้องแล้ว", "คัดลอกไม่ได้ โปรดเลือกรหัสแล้วคัดลอกด้วยตนเอง", "ห้องนี้เต็มแล้ว",
    "ห้องนี้หมดอายุแล้ว", "เกมคนละเวอร์ชัน โปรดโหลดหน้าใหม่", "เชื่อมต่อไม่ได้ โปรดตรวจสอบการเชื่อมต่อ", "เข้าที่นั่งนี้ไม่ได้",
    "โปรดรอสักครู่แล้วลองใหม่", "ยังสร้างห้องใหม่ไม่ได้ในขณะนี้", "การเชื่อมต่อหลุด", "คู่ต่อสู้ออกจากห้องแล้ว", "โปรดลองใหม่", "โปรดตรวจสอบข้อมูลที่ป้อน",
    "โจมตีโดนหัวใจ", "หัวใจทั้งสองถูกโจมตีพร้อมกัน", "หมดเวลา", "จบเกมด้วยการยอมแพ้", "การเชื่อมต่อขาดหาย", "กำลังรออัปเดตอันดับ"
  ]
};

const shareText = {
  ja: ["{p0}\n{p1}・スコア {p2}\n{p4}{p3}"],
  en: ["{p0}\n{p1} · Score {p2}\n{p4}{p3}"],
  es: ["{p0}\n{p1} · Puntuación {p2}\n{p4}{p3}"],
  "pt-BR": ["{p0}\n{p1} · Pontuação {p2}\n{p4}{p3}"],
  "zh-Hans": ["{p0}\n{p1} · 得分 {p2}\n{p4}{p3}"],
  fr: ["{p0}\n{p1} · Score {p2}\n{p4}{p3}"],
  de: ["{p0}\n{p1} · Punktzahl {p2}\n{p4}{p3}"],
  ko: ["{p0}\n{p1} · 점수 {p2}\n{p4}{p3}"],
  ru: ["{p0}\n{p1} · Очки {p2}\n{p4}{p3}"],
  it: ["{p0}\n{p1} · Punteggio {p2}\n{p4}{p3}"],
  "zh-Hant": ["{p0}\n{p1} · 得分 {p2}\n{p4}{p3}"],
  id: ["{p0}\n{p1} · Skor {p2}\n{p4}{p3}"],
  tr: ["{p0}\n{p1} · Skor {p2}\n{p4}{p3}"],
  vi: ["{p0}\n{p1} · Điểm {p2}\n{p4}{p3}"],
  th: ["{p0}\n{p1} · คะแนน {p2}\n{p4}{p3}"]
};

const detailKeys = ["winBonus", "headBreak", "brokenPartHits", "hitsOnOwnBrokenParts"];
const detailText = {
  ja: ["勝利点", "壊した相手の頭", "壊れた相手の部位への命中", "壊れた自分の部位への被弾"],
  en: ["Win bonus", "Opponent’s head broken", "Hits on broken opponent parts", "Hits on own broken parts"],
  es: ["Bono por victoria", "Cabeza rival rota", "Golpes a partes rotas del rival", "Golpes recibidos en partes rotas"],
  "pt-BR": ["Bônus por vitória", "Cabeça do adversário quebrada", "Golpes em partes quebradas do adversário", "Golpes recebidos em partes quebradas"],
  "zh-Hans": ["胜利加分", "对手头部破坏", "击中对手已破坏部位", "自身已破坏部位被击中"],
  fr: ["Bonus de victoire", "Tête de l’adversaire détruite", "Coups aux parties brisées de l’adversaire", "Coups reçus aux parties brisées"],
  de: ["Siegesbonus", "Kopf des Gegners zerstört", "Treffer an zerstörten Teilen des Gegners", "Treffer an eigenen zerstörten Teilen"],
  ko: ["승리 보너스", "상대 머리 파괴", "파괴된 상대 부위 명중", "파괴된 내 부위에 피격"],
  ru: ["Бонус за победу", "Голова соперника разбита", "Удары по сломанным частям соперника", "Удары по своим сломанным частям"],
  it: ["Bonus vittoria", "Testa avversaria distrutta", "Colpi alle parti rotte dell’avversario", "Colpi subiti alle parti rotte"],
  "zh-Hant": ["勝利加分", "對手頭部破壞", "擊中對手已破壞部位", "自身已破壞部位被擊中"],
  id: ["Bonus menang", "Kepala lawan hancur", "Pukulan ke bagian lawan yang rusak", "Pukulan yang diterima di bagian rusak"],
  tr: ["Galibiyet bonusu", "Rakibin başı kırıldı", "Rakibin kırık uzuvlarına isabet", "Kendi kırık uzuvlarına gelen darbeler"],
  vi: ["Thưởng thắng trận", "Đầu đối thủ bị phá", "Đòn trúng bộ phận đã hỏng của đối thủ", "Đòn nhận vào bộ phận đã hỏng"],
  th: ["คะแนนโบนัสจากการชนะ", "ทำลายหัวคู่ต่อสู้", "โจมตีส่วนที่พังแล้วของคู่ต่อสู้", "ถูกโจมตีตรงส่วนที่พังแล้ว"]
};

const roomKeys = ["swapSeats", "kickGuest", "leaveRoom", "clearRoomCode", "kicked"];
const roomText = {
  ja: ["席を入れ替える", "相手を外す", "ルームから退出", "ルームIDを消す", "ルームオーナーの操作で退出しました。"],
  en: ["Swap P1 and P2", "Remove guest", "Leave room", "Clear room ID", "The room owner removed you."],
  es: ["Intercambiar J1 y J2", "Expulsar al invitado", "Salir de la sala", "Borrar ID de sala", "El anfitrión te expulsó de la sala."],
  "pt-BR": ["Trocar J1 e J2", "Remover convidado", "Sair da sala", "Apagar ID da sala", "O anfitrião removeu você da sala."],
  "zh-Hans": ["交换 1P 和 2P", "移出访客", "退出房间", "清除房间 ID", "房主已将你移出房间。"],
  fr: ["Échanger J1 et J2", "Exclure l’invité", "Quitter le salon", "Effacer le code du salon", "L’hôte t’a retiré du salon."],
  de: ["P1 und P2 tauschen", "Gast entfernen", "Raum verlassen", "Raum-ID löschen", "Der Gastgeber hat dich entfernt."],
  ko: ["1P와 2P 바꾸기", "참가자 내보내기", "방 나가기", "방 ID 지우기", "방장이 내보냈습니다."],
  ru: ["Поменять игроков местами", "Удалить гостя", "Выйти из комнаты", "Очистить код комнаты", "Владелец удалил вас из комнаты."],
  it: ["Scambia P1 e P2", "Rimuovi l’ospite", "Esci dalla stanza", "Cancella ID stanza", "L’host ti ha rimosso dalla stanza."],
  "zh-Hant": ["交換 1P 和 2P", "移出訪客", "退出房間", "清除房間 ID", "房主已將你移出房間。"],
  id: ["Tukar P1 dan P2", "Keluarkan tamu", "Keluar dari ruang", "Hapus ID ruang", "Pemilik ruang mengeluarkanmu."],
  tr: ["1. ve 2. oyuncuyu değiştir", "Misafiri çıkar", "Odadan ayrıl", "Oda kodunu sil", "Oda sahibi seni çıkardı."],
  vi: ["Đổi chỗ P1 và P2", "Mời khách rời phòng", "Rời phòng", "Xóa mã phòng", "Chủ phòng đã đưa bạn ra khỏi phòng."],
  th: ["สลับ P1 กับ P2", "นำผู้เข้าร่วมออก", "ออกจากห้อง", "ล้างรหัสห้อง", "เจ้าของห้องนำคุณออกจากห้องแล้ว"]
};

const dignityKeys = ["shareResult", "dignityWin", "dignityLoss", "dignityLevel1", "dignityLevel2", "dignityLevel3", "dignityLevel4"];
const dignityText = {
  ja: ["Xに結果をシェア", "{p0}の尊厳を{p1}破壊した", "{p0}に尊厳を{p1}破壊された", "少し", "すごく", "たくさん", "徹底的に"],
  en: ["Share result on X", "I destroyed {p0}’s dignity{p1}", "{p0} destroyed my dignity{p1}", " a little", " badly", " severely", " completely"],
  es: ["Compartir resultado en X", "Destruí la dignidad de {p0}{p1}", "{p0} destruyó mi dignidad{p1}", " un poco", " en gran medida", " de forma devastadora", " por completo"],
  "pt-BR": ["Compartilhar resultado no X", "Destruí a dignidade de {p0}{p1}", "{p0} destruiu minha dignidade{p1}", " um pouco", " em grande parte", " de forma devastadora", " por completo"],
  "zh-Hans": ["在 X 分享结果", "我{p1}摧毁了{p0}的尊严", "{p0}{p1}摧毁了我的尊严", "稍微", "大幅", "狠狠地", "彻底"],
  fr: ["Partager le résultat sur X", "J’ai détruit la dignité de {p0}{p1}", "{p0} a détruit ma dignité{p1}", " un peu", " en grande partie", " sans pitié", " complètement"],
  de: ["Ergebnis auf X teilen", "Ich habe {p0}s Würde{p1} zerstört", "{p0} hat meine Würde{p1} zerstört", " ein wenig", " stark", " massiv", " vollständig"],
  ko: ["X에 결과 공유", "{p0}의 존엄을 {p1}파괴했다", "{p0}에게 존엄을 {p1}파괴당했다", "조금 ", "크게 ", "엄청나게 ", "철저히 "],
  ru: ["Поделиться результатом в X", "Я{p1} уничтожил достоинство игрока {p0}", "Игрок {p0}{p1} уничтожил моё достоинство", " немного", " серьёзно", " жестоко", " полностью"],
  it: ["Condividi il risultato su X", "Ho distrutto la dignità di {p0}{p1}", "{p0} ha distrutto la mia dignità{p1}", " un po’", " in gran parte", " senza pietà", " del tutto"],
  "zh-Hant": ["在 X 分享結果", "我{p1}摧毀了{p0}的尊嚴", "{p0}{p1}摧毀了我的尊嚴", "稍微", "大幅", "狠狠地", "徹底"],
  id: ["Bagikan hasil di X", "Aku menghancurkan martabat {p0}{p1}", "{p0} menghancurkan martabatku{p1}", " sedikit", " cukup parah", " habis-habisan", " sepenuhnya"],
  tr: ["Sonucu X’te paylaş", "{p0} adlı oyuncunun onurunu{p1} kırdım", "{p0} onurumu{p1} kırdı", " biraz", " epey", " ağır biçimde", " tamamen"],
  vi: ["Chia sẻ kết quả lên X", "Tôi đã{p1} phá tan phẩm giá của {p0}", "{p0} đã{p1} phá tan phẩm giá của tôi", " phần nào", " đáng kể", " không thương tiếc", " hoàn toàn"],
  th: ["แชร์ผลบน X", "ฉันทำลายศักดิ์ศรีของ {p0}{p1}", "{p0} ทำลายศักดิ์ศรีของฉัน{p1}", "เล็กน้อย", "อย่างหนัก", "แบบยับเยิน", "จนหมดสิ้น"]
};

const keyboardKeys = ["keyboardTitle", "keyboardHelp", "keyboardWaiting", "keyAttack", "keyGuard"];
const keyboardText = {
  ja: ["設定", "変更する操作を選び、新しいキーを押してください。使用中のキーは入れ替わります。", "新しいキーを押してください。", "攻撃", "防御"],
  en: ["Settings", "Choose an action and press a key. If it is already in use, the two bindings swap.", "Press a new key.", "Attack", "Guard"],
  es: ["Ajustes", "Elige una acción y pulsa una tecla. Si ya se usa, las dos teclas se intercambian.", "Pulsa una nueva tecla.", "Ataque", "Defensa"],
  "pt-BR": ["Configurações", "Escolha uma ação e pressione uma tecla. Se ela já estiver em uso, as duas teclas serão trocadas.", "Pressione uma nova tecla.", "Ataque", "Defesa"],
  "zh-Hans": ["设置", "选择一个操作并按下新按键。如果按键已被使用，两个按键会互换。", "请按下新按键。", "攻击", "防御"],
  fr: ["Paramètres", "Choisis une action et appuie sur une touche. Si elle est déjà utilisée, les deux touches sont échangées.", "Appuie sur une nouvelle touche.", "Attaque", "Garde"],
  de: ["Einstellungen", "Wähle eine Aktion und drücke eine Taste. Ist sie belegt, werden die beiden Tasten getauscht.", "Drücke eine neue Taste.", "Angriff", "Block"],
  ko: ["설정", "바꿀 동작을 선택하고 새 키를 누르세요. 이미 사용 중인 키라면 두 키가 서로 바뀝니다.", "새 키를 누르세요.", "공격", "방어"],
  ru: ["Настройки", "Выберите действие и нажмите клавишу. Если она занята, назначения поменяются местами.", "Нажмите новую клавишу.", "Атака", "Защита"],
  it: ["Impostazioni", "Scegli un’azione e premi un tasto. Se è già in uso, i due tasti si scambiano.", "Premi un nuovo tasto.", "Attacco", "Difesa"],
  "zh-Hant": ["設定", "選擇一個操作並按下新按鍵。如果按鍵已使用，兩個按鍵會互換。", "請按下新按鍵。", "攻擊", "防禦"],
  id: ["Pengaturan", "Pilih aksi lalu tekan tombol baru. Jika sudah digunakan, kedua tombol akan bertukar.", "Tekan tombol baru.", "Serang", "Bertahan"],
  tr: ["Ayarlar", "Bir hareket seçip bir tuşa bas. Tuş kullanılıyorsa iki tuş yer değiştirir.", "Yeni bir tuşa bas.", "Saldırı", "Savunma"],
  vi: ["Cài đặt", "Chọn thao tác rồi nhấn một phím. Nếu phím đã được dùng, hai phím sẽ đổi chỗ.", "Nhấn một phím mới.", "Tấn công", "Đỡ đòn"],
  th: ["การตั้งค่า", "เลือกการกระทำแล้วกดปุ่มใหม่ หากปุ่มถูกใช้อยู่ ปุ่มทั้งสองจะสลับกัน", "กดปุ่มใหม่", "โจมตี", "ป้องกัน"]
};

const cpuKeys = ["cpuMatch", "cpuSeries"];
const cpuText = {
  "ja": ["CPUと戦う", "CPUと連続試合"],
  "en": ["Fight the CPU", "CPU match series"],
  "es": ["Jugar contra la CPU", "Serie contra la CPU"],
  "pt-BR": ["Enfrentar a CPU", "Série contra a CPU"],
  "zh-Hans": ["与电脑对战", "与电脑连续对战"],
  "fr": ["Affronter le CPU", "Série contre le CPU"],
  "de": ["Gegen den Computer", "Kampfserie gegen den Computer"],
  "ko": ["CPU와 대전", "CPU와 연전"],
  "ru": ["Матч против компьютера", "Серия против компьютера"],
  "it": ["Sfida la CPU", "Serie contro la CPU"],
  "zh-Hant": ["與電腦對戰", "與電腦連續對戰"],
  "id": ["Lawan CPU", "Seri melawan CPU"],
  "tr": ["Bilgisayara karşı oyna", "Bilgisayara karşı maç serisi"],
  "vi": ["Đấu với máy", "Đấu liên tiếp với máy"],
  "th": ["แข่งกับคอมพิวเตอร์", "แข่งต่อเนื่องกับคอมพิวเตอร์"]
};

const listingKeys = ["openRooms", "refreshRooms", "roomsLoading", "roomsEmpty", "roomsFailed", "joinListedRoom"];
const listingText = {
  ja: ["参加できるルーム", "ルーム更新", "ルームを確認中…", "今は参加できるルームがありません。", "一覧を取得できませんでした。「ルーム更新」で再度お試しください。", "ルーム {p0} に参加"],
  en: ["Available rooms", "Refresh rooms", "Checking rooms…", "No rooms are available right now.", "Couldn’t load the rooms. Tap Refresh rooms to try again.", "Join room {p0}"],
  es: ["Salas disponibles", "Actualizar salas", "Buscando salas…", "Ahora no hay salas disponibles.", "No se pudieron cargar las salas. Pulsa «Actualizar salas» para reintentar.", "Entrar en la sala {p0}"],
  "pt-BR": ["Salas disponíveis", "Atualizar salas", "Buscando salas…", "Nenhuma sala disponível no momento.", "Não foi possível carregar as salas. Toque em Atualizar salas para tentar de novo.", "Entrar na sala {p0}"],
  "zh-Hans": ["可加入的房间", "刷新房间", "正在查询房间…", "暂时没有可加入的房间。", "无法加载房间列表。请点“刷新房间”重试。", "加入房间 {p0}"],
  fr: ["Salles disponibles", "Actualiser les salles", "Recherche de salles…", "Aucune salle disponible pour le moment.", "Impossible de charger les salles. Appuyez sur « Actualiser les salles » pour réessayer.", "Rejoindre la salle {p0}"],
  de: ["Verfügbare Räume", "Räume aktualisieren", "Räume werden gesucht…", "Zurzeit sind keine Räume frei.", "Die Räume konnten nicht geladen werden. Tippe zum Wiederholen auf „Räume aktualisieren“.", "Raum {p0} beitreten"],
  ko: ["참가 가능한 방", "방 목록 새로고침", "방을 확인하는 중…", "지금은 참가할 수 있는 방이 없습니다.", "방 목록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도하세요.", "{p0}번 방 참가"],
  ru: ["Доступные комнаты", "Обновить список", "Поиск комнат…", "Сейчас свободных комнат нет.", "Не удалось загрузить комнаты. Нажмите «Обновить список», чтобы повторить.", "Войти в комнату {p0}"],
  it: ["Stanze disponibili", "Aggiorna stanze", "Ricerca stanze…", "Al momento non ci sono stanze disponibili.", "Impossibile caricare le stanze. Tocca Aggiorna stanze per riprovare.", "Entra nella stanza {p0}"],
  "zh-Hant": ["可加入的房間", "重新整理房間", "正在查詢房間…", "目前沒有可加入的房間。", "無法載入房間清單。請點選「重新整理房間」再試一次。", "加入房間 {p0}"],
  id: ["Ruang tersedia", "Muat ulang ruang", "Mencari ruang…", "Belum ada ruang yang tersedia.", "Daftar ruang gagal dimuat. Ketuk Muat ulang ruang untuk mencoba lagi.", "Gabung ke ruang {p0}"],
  tr: ["Müsait odalar", "Odaları yenile", "Odalar aranıyor…", "Şu anda müsait oda yok.", "Odalar yüklenemedi. Tekrar denemek için Odaları yenile’ye dokunun.", "{p0} numaralı odaya katıl"],
  vi: ["Phòng có thể tham gia", "Làm mới danh sách", "Đang tìm phòng…", "Hiện chưa có phòng trống.", "Không tải được danh sách phòng. Hãy nhấn Làm mới danh sách để thử lại.", "Vào phòng {p0}"],
  th: ["ห้องที่เข้าร่วมได้", "รีเฟรชรายชื่อห้อง", "กำลังค้นหาห้อง…", "ตอนนี้ยังไม่มีห้องว่าง", "โหลดรายชื่อห้องไม่สำเร็จ แตะรีเฟรชรายชื่อห้องเพื่อลองอีกครั้ง", "เข้าร่วมห้อง {p0}"],
};

const opponentOffline = {
  ja: "相手の接続が切れました。戻るまでお待ちください。",
  en: "Your opponent disconnected. Waiting for them to return.",
  es: "Tu rival se desconectó. Esperando a que vuelva.",
  "pt-BR": "Seu oponente se desconectou. Aguardando o retorno.",
  "zh-Hans": "对手已断开连接，正在等待对方返回。",
  fr: "Votre adversaire est déconnecté. En attente de son retour.",
  de: "Dein Gegenüber ist offline. Warte auf die Rückkehr.",
  ko: "상대의 연결이 끊겼습니다. 돌아올 때까지 기다려 주세요.",
  ru: "Соперник отключился. Ожидаем его возвращения.",
  it: "L’avversario si è disconnesso. In attesa del suo ritorno.",
  "zh-Hant": "對手已中斷連線，正在等待對方返回。",
  id: "Lawan terputus. Menunggu lawan kembali.",
  tr: "Rakibin bağlantısı kesildi. Geri dönmesi bekleniyor.",
  vi: "Đối thủ đã mất kết nối. Đang chờ họ quay lại.",
  th: "คู่ต่อสู้ขาดการเชื่อมต่อ กำลังรอให้กลับมา",
};

export const onlineMessages = Object.fromEntries(Object.keys(interfaceText).map(language => {
  const keys = [...interfaceKeys, ...statusKeys, ...shareKeys, ...detailKeys, ...roomKeys, ...dignityKeys, ...keyboardKeys, ...cpuKeys, ...listingKeys, "opponentOffline"];
  const values = [...interfaceText[language], ...statusText[language], ...shareText[language], ...detailText[language], ...roomText[language], ...dignityText[language], ...keyboardText[language], ...cpuText[language], ...listingText[language], opponentOffline[language]];
  if (keys.length !== values.length) throw new Error(`Incomplete translation: ${language}`);
  return [language, Object.fromEntries(keys.map((key, index) => [key, values[index]]))];
}));
