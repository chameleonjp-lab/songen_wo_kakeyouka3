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

const shareKeys = ["inviteText", "scoreText"];

const interfaceText = {
  ja: [
    "友だちと一対一。拳で相手の心臓を狙え！", "ゲームの準備", "プレイヤー登録", "プレイヤー名（任意）", "顔を選ぶ",
    "ルームを立てる", "ルームID", "IDをコピー", "待機室へ", "待機室", "準備完了", "ホーム", "プレイヤー{p0}", "あなた",
    "相手を待っています", "二人が準備完了すると対戦が始まります", "接続しています…", "再接続しています…",
    "対戦を一時停止しました。接続の復帰を待っています（残り{p0}秒）", "降参", "降参すると相手の勝ちになります。降参しますか？",
    "結果発表", "スコア結果へ", "スコア結果", "ルームに戻る", "拳", "ガード", "左に移動", "右に移動", "スタミナ", "顔 {p0}"
  ],
  en: [
    "Aim for the heart. Fight a friend online with emoji.", "Set up game", "Player registration", "Player name (optional)", "Choose a face",
    "Create a room", "Room ID", "Copy ID", "Enter lobby", "Lobby", "Ready", "Home", "Player {p0}", "You",
    "Waiting for your opponent", "The match starts when both players are ready", "Connecting…", "Reconnecting…",
    "Match paused. Waiting for reconnection ({p0}s left)", "Surrender", "Your opponent wins if you surrender. Surrender now?",
    "Match result", "View score", "Score result", "Return to room", "Punch", "Guard", "Move left", "Move right", "Stamina", "Face {p0}"
  ],
  es: [
    "Apunta al corazón. Lucha en línea con un amigo usando emojis.", "Preparar partida", "Registro de jugador", "Nombre (opcional)", "Elige una cara",
    "Crear sala", "ID de sala", "Copiar ID", "Ir a la sala de espera", "Sala de espera", "Listo", "Inicio", "Jugador {p0}", "Tú",
    "Esperando al rival", "La partida comienza cuando ambos estén listos", "Conectando…", "Reconectando…",
    "Partida en pausa. Esperando reconexión (quedan {p0} s)", "Rendirse", "Si te rindes, tu rival gana. ¿Te rindes?",
    "Resultado de la partida", "Ver puntuación", "Puntuación final", "Volver a la sala", "Puño", "Bloqueo", "Mover a la izquierda", "Mover a la derecha", "Resistencia", "Cara {p0}"
  ],
  "pt-BR": [
    "Mire no coração. Enfrente um amigo online com emojis.", "Preparar partida", "Cadastro de jogador", "Nome (opcional)", "Escolha um rosto",
    "Criar sala", "ID da sala", "Copiar ID", "Entrar na sala de espera", "Sala de espera", "Pronto", "Início", "Jogador {p0}", "Você",
    "Aguardando o adversário", "A partida começa quando os dois estiverem prontos", "Conectando…", "Reconectando…",
    "Partida pausada. Aguardando reconexão (faltam {p0} s)", "Desistir", "Se você desistir, o adversário ganha. Quer desistir?",
    "Resultado da partida", "Ver pontuação", "Pontuação final", "Voltar à sala", "Soco", "Defesa", "Mover à esquerda", "Mover à direita", "Energia", "Rosto {p0}"
  ],
  "zh-Hans": [
    "用拳头瞄准心脏，和朋友用表情符号在线对战。", "准备游戏", "玩家登记", "玩家名（选填）", "选择头像", "创建房间", "房间 ID", "复制 ID", "进入等候室",
    "等候室", "准备就绪", "首页", "玩家 {p0}", "你", "正在等待对手", "双方准备就绪后开始对战", "正在连接…", "正在重新连接…",
    "对战已暂停，等待重新连接（剩余 {p0} 秒）", "认输", "认输后对手获胜。确定认输吗？", "对战结果", "查看得分", "得分结果", "返回房间", "出拳", "格挡", "向左移动", "向右移动", "体力", "头像 {p0}"
  ],
  fr: [
    "Vise le cœur. Affronte un ami en ligne avec des émojis.", "Préparer la partie", "Inscription du joueur", "Nom (facultatif)", "Choisir un visage",
    "Créer un salon", "Identifiant du salon", "Copier l’identifiant", "Entrer en salle d’attente", "Salle d’attente", "Prêt", "Accueil", "Joueur {p0}", "Toi",
    "En attente de ton adversaire", "La partie commence quand les deux joueurs sont prêts", "Connexion…", "Reconnexion…",
    "Partie en pause. En attente de reconnexion (reste {p0} s)", "Abandonner", "Ton adversaire gagne si tu abandonnes. Abandonner ?",
    "Résultat de la partie", "Voir le score", "Score final", "Retour au salon", "Poing", "Garde", "Aller à gauche", "Aller à droite", "Endurance", "Visage {p0}"
  ],
  de: [
    "Ziel aufs Herz. Kämpfe online mit Emojis gegen einen Freund.", "Spiel vorbereiten", "Spieleranmeldung", "Spielername (optional)", "Gesicht wählen",
    "Raum erstellen", "Raum-ID", "ID kopieren", "Zum Warteraum", "Warteraum", "Bereit", "Startseite", "Spieler {p0}", "Du",
    "Warte auf deinen Gegner", "Das Spiel beginnt, sobald beide bereit sind", "Verbindung wird hergestellt…", "Verbindung wird wiederhergestellt…",
    "Spiel pausiert. Warte auf die Wiederverbindung (noch {p0} s)", "Aufgeben", "Wenn du aufgibst, gewinnt dein Gegner. Wirklich aufgeben?",
    "Spielergebnis", "Punktzahl ansehen", "Endpunktzahl", "Zurück zum Raum", "Faust", "Blocken", "Nach links bewegen", "Nach rechts bewegen", "Ausdauer", "Gesicht {p0}"
  ],
  ko: [
    "주먹으로 심장을 노려라. 친구와 이모지로 온라인 대전!", "게임 준비", "플레이어 등록", "플레이어 이름 (선택)", "얼굴 고르기", "방 만들기", "방 ID",
    "ID 복사", "대기실 입장", "대기실", "준비 완료", "홈", "플레이어 {p0}", "나", "상대를 기다리는 중", "두 사람 모두 준비하면 대전이 시작됩니다",
    "연결 중…", "다시 연결 중…", "대전을 일시 정지했습니다. 연결 대기 중 ({p0}초 남음)", "항복", "항복하면 상대가 승리합니다. 항복할까요?",
    "대전 결과", "점수 보기", "점수 결과", "방으로 돌아가기", "주먹", "방어", "왼쪽으로 이동", "오른쪽으로 이동", "체력", "얼굴 {p0}"
  ],
  ru: [
    "Целься в сердце. Сразись с другом онлайн с помощью эмодзи.", "Подготовить игру", "Регистрация игрока", "Имя (необязательно)", "Выбрать лицо",
    "Создать комнату", "Код комнаты", "Копировать код", "Войти в зал ожидания", "Зал ожидания", "Готов", "Главная", "Игрок {p0}", "Вы",
    "Ожидание соперника", "Матч начнётся, когда оба игрока будут готовы", "Подключение…", "Переподключение…",
    "Матч приостановлен. Ждём подключения (осталось {p0} с)", "Сдаться", "Если вы сдадитесь, соперник победит. Сдаться?",
    "Итоги матча", "Посмотреть очки", "Итоговые очки", "Вернуться в комнату", "Удар", "Блок", "Двигаться влево", "Двигаться вправо", "Выносливость", "Лицо {p0}"
  ],
  it: [
    "Mira al cuore. Sfida un amico online con le emoji.", "Prepara la partita", "Registrazione giocatore", "Nome (facoltativo)", "Scegli un volto",
    "Crea una stanza", "ID stanza", "Copia ID", "Entra in sala d’attesa", "Sala d’attesa", "Pronto", "Home", "Giocatore {p0}", "Tu",
    "In attesa dell’avversario", "La partita inizia quando entrambi sono pronti", "Connessione…", "Riconnessione…",
    "Partita in pausa. In attesa della riconnessione (restano {p0} s)", "Arrenditi", "Se ti arrendi, vince l’avversario. Arrendersi?",
    "Risultato della partita", "Vedi punteggio", "Punteggio finale", "Torna alla stanza", "Pugno", "Parata", "Vai a sinistra", "Vai a destra", "Resistenza", "Volto {p0}"
  ],
  "zh-Hant": [
    "用拳頭瞄準心臟，和朋友用表情符號線上對戰。", "準備遊戲", "玩家登記", "玩家名稱（選填）", "選擇頭像", "建立房間", "房間 ID", "複製 ID", "進入等候室",
    "等候室", "準備就緒", "首頁", "玩家 {p0}", "你", "正在等候對手", "雙方準備就緒後開始對戰", "正在連線…", "正在重新連線…",
    "對戰已暫停，等候重新連線（剩餘 {p0} 秒）", "認輸", "認輸後對手獲勝。確定認輸嗎？", "對戰結果", "查看分數", "分數結果", "返回房間", "出拳", "格擋", "向左移動", "向右移動", "體力", "頭像 {p0}"
  ],
  id: [
    "Bidik jantungnya. Lawan teman secara daring dengan emoji.", "Siapkan permainan", "Pendaftaran pemain", "Nama (opsional)", "Pilih wajah",
    "Buat ruang", "ID ruang", "Salin ID", "Masuk ruang tunggu", "Ruang tunggu", "Siap", "Beranda", "Pemain {p0}", "Kamu",
    "Menunggu lawan", "Pertandingan dimulai saat kedua pemain siap", "Menghubungkan…", "Menghubungkan kembali…",
    "Pertandingan dijeda. Menunggu sambungan (sisa {p0} dtk)", "Menyerah", "Lawan menang jika kamu menyerah. Mau menyerah?",
    "Hasil pertandingan", "Lihat skor", "Skor akhir", "Kembali ke ruang", "Pukul", "Tangkis", "Bergerak ke kiri", "Bergerak ke kanan", "Stamina", "Wajah {p0}"
  ],
  tr: [
    "Kalbi hedefle. Bir arkadaşınla emojilerle çevrimiçi dövüş.", "Oyunu hazırla", "Oyuncu kaydı", "Oyuncu adı (isteğe bağlı)", "Yüz seç",
    "Oda oluştur", "Oda kodu", "Kodu kopyala", "Bekleme odasına gir", "Bekleme odası", "Hazır", "Ana sayfa", "Oyuncu {p0}", "Sen",
    "Rakip bekleniyor", "İki oyuncu da hazır olunca maç başlar", "Bağlanıyor…", "Yeniden bağlanıyor…",
    "Maç duraklatıldı. Bağlantı bekleniyor ({p0} sn kaldı)", "Pes et", "Pes edersen rakibin kazanır. Pes etmek istiyor musun?",
    "Maç sonucu", "Skoru gör", "Son skor", "Odaya dön", "Yumruk", "Savunma", "Sola hareket et", "Sağa hareket et", "Dayanıklılık", "Yüz {p0}"
  ],
  vi: [
    "Nhắm vào trái tim. Đấu trực tuyến với bạn bè bằng emoji.", "Chuẩn bị trò chơi", "Đăng ký người chơi", "Tên (không bắt buộc)", "Chọn khuôn mặt",
    "Tạo phòng", "Mã phòng", "Sao chép mã", "Vào phòng chờ", "Phòng chờ", "Sẵn sàng", "Trang chủ", "Người chơi {p0}", "Bạn",
    "Đang chờ đối thủ", "Trận đấu bắt đầu khi cả hai đã sẵn sàng", "Đang kết nối…", "Đang kết nối lại…",
    "Trận đấu tạm dừng. Đang chờ kết nối lại (còn {p0} giây)", "Đầu hàng", "Nếu bạn đầu hàng, đối thủ sẽ thắng. Bạn muốn đầu hàng?",
    "Kết quả trận đấu", "Xem điểm", "Điểm cuối trận", "Quay lại phòng", "Đấm", "Đỡ đòn", "Di chuyển sang trái", "Di chuyển sang phải", "Thể lực", "Khuôn mặt {p0}"
  ],
  th: [
    "เล็งหมัดไปที่หัวใจ แล้วสู้กับเพื่อนออนไลน์ด้วยอีโมจิ", "เตรียมเกม", "ลงทะเบียนผู้เล่น", "ชื่อผู้เล่น (ไม่บังคับ)", "เลือกใบหน้า",
    "สร้างห้อง", "รหัสห้อง", "คัดลอกรหัส", "เข้าห้องรอ", "ห้องรอ", "พร้อม", "หน้าหลัก", "ผู้เล่น {p0}", "คุณ",
    "กำลังรอคู่ต่อสู้", "เกมจะเริ่มเมื่อทั้งสองคนพร้อม", "กำลังเชื่อมต่อ…", "กำลังเชื่อมต่อใหม่…",
    "หยุดเกมชั่วคราว กำลังรอการเชื่อมต่อใหม่ (เหลือ {p0} วิ)", "ยอมแพ้", "ถ้าคุณยอมแพ้ คู่ต่อสู้จะชนะ ต้องการยอมแพ้ไหม",
    "ผลการแข่งขัน", "ดูคะแนน", "คะแนนสุดท้าย", "กลับไปที่ห้อง", "ต่อย", "ป้องกัน", "ไปทางซ้าย", "ไปทางขวา", "พลัง", "ใบหน้า {p0}"
  ]
};

const statusText = {
  ja: [
    "12文字のルームIDを入力してください。", "ルームIDをコピーしました。", "コピーできませんでした。IDを選択してコピーしてください。", "このルームは満員です。",
    "ルームの有効期限が切れました。", "ゲームの版が異なります。画面を再読み込みしてください。", "通信できませんでした。接続を確認してください。",
    "この席には接続できません。", "少し待ってからもう一度お試しください。", "ただいま新しいルームを作れません。",
    "接続が切れました。", "相手が退出しました。", "もう一度お試しください。", "入力した内容を確認してください。",
    "心臓への命中", "両者の心臓に同時に命中", "時間切れ", "降参で決着", "通信中断", "ランキングへの反映を待っています。"
  ],
  en: [
    "Enter the 12-character room ID.", "Room ID copied.", "Couldn’t copy the ID. Select and copy it manually.", "This room is full.",
    "This room has expired.", "Game versions differ. Reload this page.", "Couldn’t connect. Check your connection.", "Couldn’t access this seat.",
    "Wait a moment and try again.", "New rooms are temporarily unavailable.", "Connection lost.", "Your opponent left.", "Please try again.", "Check what you entered.",
    "Heart hit", "Both hearts hit at the same time", "Time ran out", "Match ended by surrender", "Connection interrupted", "Waiting for the leaderboard to update."
  ],
  es: [
    "Introduce el ID de sala de 12 caracteres.", "ID de sala copiado.", "No se pudo copiar el ID. Selecciónalo y cópialo manualmente.", "La sala está llena.",
    "La sala ha caducado.", "Las versiones del juego son distintas. Recarga la página.", "No se pudo conectar. Revisa la conexión.", "No se pudo acceder a esta plaza.",
    "Espera un momento e inténtalo de nuevo.", "Por ahora no se pueden crear salas.", "Se perdió la conexión.", "Tu rival salió.", "Inténtalo de nuevo.", "Revisa los datos introducidos.",
    "Golpe al corazón", "Ambos corazones golpeados a la vez", "Se agotó el tiempo", "Partida decidida por rendición", "Conexión interrumpida", "Esperando la actualización de la clasificación."
  ],
  "pt-BR": [
    "Digite o ID de sala de 12 caracteres.", "ID da sala copiado.", "Não foi possível copiar o ID. Selecione e copie manualmente.", "A sala está lotada.",
    "O prazo da sala expirou.", "As versões do jogo são diferentes. Recarregue a página.", "Não foi possível conectar. Verifique sua conexão.", "Não foi possível acessar esta vaga.",
    "Aguarde um pouco e tente novamente.", "A criação de salas está indisponível no momento.", "Conexão perdida.", "Seu adversário saiu.", "Tente novamente.", "Confira o que foi digitado.",
    "Golpe no coração", "Os dois corações foram atingidos ao mesmo tempo", "Tempo esgotado", "Partida decidida por desistência", "Conexão interrompida", "Aguardando a atualização do ranking."
  ],
  "zh-Hans": [
    "请输入 12 个字符的房间 ID。", "已复制房间 ID。", "无法自动复制，请选中 ID 后手动复制。", "房间已满。",
    "房间已过期。", "游戏版本不同，请重新加载此页面。", "无法连接，请检查网络。", "无法连接到此席位。",
    "请稍等后再试。", "暂时无法创建新房间。", "连接已断开。", "对手已退出。", "请重试。", "请检查输入内容。",
    "心脏被击中", "双方心脏同时被击中", "时间到", "对战因认输结束", "连接中断", "正在等待排行榜更新。"
  ],
  fr: [
    "Saisis l’identifiant du salon à 12 caractères.", "Identifiant du salon copié.", "Copie impossible. Sélectionne et copie l’identifiant manuellement.", "Ce salon est complet.",
    "Ce salon a expiré.", "Les versions du jeu diffèrent. Recharge cette page.", "Connexion impossible. Vérifie ta connexion.", "Impossible d’accéder à cette place.",
    "Attends un instant et réessaie.", "La création de salons est momentanément indisponible.", "Connexion perdue.", "Ton adversaire a quitté la partie.", "Réessaie.", "Vérifie ta saisie.",
    "Coup au cœur", "Les deux cœurs ont été touchés en même temps", "Temps écoulé", "Partie terminée par un abandon", "Connexion interrompue", "En attente de la mise à jour du classement."
  ],
  de: [
    "Gib die 12 Zeichen lange Raum-ID ein.", "Raum-ID kopiert.", "Kopieren fehlgeschlagen. Markiere und kopiere die ID von Hand.", "Dieser Raum ist voll.",
    "Dieser Raum ist abgelaufen.", "Die Spielversionen unterscheiden sich. Lade die Seite neu.", "Verbindung fehlgeschlagen. Prüfe deine Verbindung.", "Dieser Platz ist nicht zugänglich.",
    "Warte kurz und versuche es erneut.", "Neue Räume sind vorübergehend nicht verfügbar.", "Verbindung getrennt.", "Dein Gegner hat den Raum verlassen.", "Versuche es erneut.", "Prüfe deine Eingabe.",
    "Treffer ins Herz", "Beide Herzen wurden gleichzeitig getroffen", "Zeit abgelaufen", "Spiel durch Aufgabe beendet", "Verbindung unterbrochen", "Warte auf die Aktualisierung der Rangliste."
  ],
  ko: [
    "12자리 방 ID를 입력하세요.", "방 ID를 복사했습니다.", "복사하지 못했습니다. ID를 선택해서 직접 복사하세요.", "방이 가득 찼습니다.",
    "방 이용 시간이 끝났습니다.", "게임 버전이 다릅니다. 페이지를 새로고침하세요.", "연결하지 못했습니다. 네트워크를 확인하세요.", "이 자리에 연결할 수 없습니다.",
    "잠시 후 다시 시도하세요.", "지금은 새 방을 만들 수 없습니다.", "연결이 끊겼습니다.", "상대가 나갔습니다.", "다시 시도하세요.", "입력 내용을 확인하세요.",
    "심장 명중", "양쪽 심장에 동시 명중", "시간 초과", "항복으로 종료", "연결 중단", "순위표가 업데이트되기를 기다리는 중입니다."
  ],
  ru: [
    "Введите 12 символов кода комнаты.", "Код комнаты скопирован.", "Не удалось скопировать код. Выделите и скопируйте его вручную.", "Комната заполнена.",
    "Срок действия комнаты истёк.", "Версии игры различаются. Обновите страницу.", "Не удалось подключиться. Проверьте соединение.", "Не удалось занять это место.",
    "Немного подождите и повторите попытку.", "Создание комнат временно недоступно.", "Связь потеряна.", "Соперник вышел.", "Повторите попытку.", "Проверьте введённые данные.",
    "Удар в сердце", "Оба сердца поражены одновременно", "Время вышло", "Матч завершён сдачей", "Связь прервана", "Ожидаем обновления таблицы лидеров."
  ],
  it: [
    "Inserisci l’ID di 12 caratteri della stanza.", "ID della stanza copiato.", "Copia non riuscita. Seleziona e copia l’ID manualmente.", "La stanza è piena.",
    "Questa stanza è scaduta.", "Le versioni del gioco sono diverse. Ricarica la pagina.", "Impossibile connettersi. Controlla la connessione.", "Impossibile accedere a questo posto.",
    "Attendi un istante e riprova.", "La creazione di nuove stanze è temporaneamente sospesa.", "Connessione persa.", "L’avversario è uscito.", "Riprova.", "Controlla ciò che hai inserito.",
    "Colpo al cuore", "Entrambi i cuori colpiti nello stesso momento", "Tempo scaduto", "Partita conclusa per resa", "Connessione interrotta", "In attesa dell’aggiornamento della classifica."
  ],
  "zh-Hant": [
    "請輸入 12 個字元的房間 ID。", "已複製房間 ID。", "無法自動複製，請選取 ID 後手動複製。", "房間已滿。",
    "房間已過期。", "遊戲版本不同，請重新載入此頁面。", "無法連線，請檢查網路。", "無法連線至此席位。",
    "請稍等後再試。", "暫時無法建立新房間。", "連線已中斷。", "對手已離開。", "請再試一次。", "請檢查輸入內容。",
    "心臟被擊中", "雙方心臟同時被擊中", "時間到", "對戰因認輸結束", "連線中斷", "正在等候排行榜更新。"
  ],
  id: [
    "Masukkan ID ruang 12 karakter.", "ID ruang disalin.", "ID gagal disalin. Pilih dan salin ID secara manual.", "Ruang ini penuh.",
    "Ruang ini kedaluwarsa.", "Versi permainan berbeda. Muat ulang halaman.", "Tidak dapat terhubung. Periksa sambungan.", "Tempat ini tidak dapat diakses.",
    "Tunggu sebentar lalu coba lagi.", "Pembuatan ruang baru sedang tidak tersedia.", "Sambungan terputus.", "Lawan keluar.", "Silakan coba lagi.", "Periksa isianmu.",
    "Jantung terkena pukulan", "Kedua jantung terkena bersamaan", "Waktu habis", "Pertandingan berakhir karena menyerah", "Sambungan terputus", "Menunggu pembaruan papan peringkat."
  ],
  tr: [
    "12 karakterlik oda kodunu gir.", "Oda kodu kopyalandı.", "Kod kopyalanamadı. Kodu seçip elle kopyala.", "Bu oda dolu.",
    "Bu odanın süresi doldu.", "Oyun sürümleri farklı. Sayfayı yeniden yükle.", "Bağlanılamadı. Bağlantını kontrol et.", "Bu koltuğa erişilemedi.",
    "Biraz bekleyip yeniden dene.", "Geçici olarak yeni oda oluşturulamıyor.", "Bağlantı kesildi.", "Rakibin ayrıldı.", "Tekrar dene.", "Girdiğin bilgileri kontrol et.",
    "Kalbe isabet", "İki kalp aynı anda vuruldu", "Süre doldu", "Maç pes etme nedeniyle bitti", "Bağlantı kesildi", "Sıralamanın güncellenmesi bekleniyor."
  ],
  vi: [
    "Nhập mã phòng gồm 12 ký tự.", "Đã sao chép mã phòng.", "Không sao chép được. Hãy chọn mã và sao chép thủ công.", "Phòng này đã đầy.",
    "Phòng đã hết hạn.", "Phiên bản trò chơi khác nhau. Hãy tải lại trang.", "Không thể kết nối. Hãy kiểm tra đường truyền.", "Không thể vào vị trí này.",
    "Hãy chờ một lúc rồi thử lại.", "Tạm thời chưa thể tạo phòng mới.", "Đã mất kết nối.", "Đối thủ đã rời đi.", "Hãy thử lại.", "Hãy kiểm tra nội dung đã nhập.",
    "Đánh trúng tim", "Hai trái tim bị đánh trúng cùng lúc", "Hết giờ", "Trận đấu kết thúc do đầu hàng", "Kết nối bị gián đoạn", "Đang chờ bảng xếp hạng cập nhật."
  ],
  th: [
    "ป้อนรหัสห้อง 12 ตัวอักษร", "คัดลอกรหัสห้องแล้ว", "คัดลอกไม่ได้ โปรดเลือกรหัสแล้วคัดลอกด้วยตนเอง", "ห้องนี้เต็มแล้ว",
    "ห้องนี้หมดอายุแล้ว", "เกมคนละเวอร์ชัน โปรดโหลดหน้าใหม่", "เชื่อมต่อไม่ได้ โปรดตรวจสอบการเชื่อมต่อ", "เข้าที่นั่งนี้ไม่ได้",
    "โปรดรอสักครู่แล้วลองใหม่", "ยังสร้างห้องใหม่ไม่ได้ในขณะนี้", "การเชื่อมต่อหลุด", "คู่ต่อสู้ออกจากห้องแล้ว", "โปรดลองใหม่", "โปรดตรวจสอบข้อมูลที่ป้อน",
    "โจมตีโดนหัวใจ", "หัวใจทั้งสองถูกโจมตีพร้อมกัน", "หมดเวลา", "จบเกมด้วยการยอมแพ้", "การเชื่อมต่อขาดหาย", "กำลังรออัปเดตอันดับ"
  ]
};

const shareText = {
  ja: ["{p0}で対戦しよう！\nルームID {p1}\n{p2}", "{p0}\n{p1}・スコア {p2}\n{p3}"],
  en: ["Play {p0} with me!\nRoom ID {p1}\n{p2}", "{p0}\n{p1} · Score {p2}\n{p3}"],
  es: ["¡Juega a {p0} conmigo!\nID de sala {p1}\n{p2}", "{p0}\n{p1} · Puntuación {p2}\n{p3}"],
  "pt-BR": ["Vamos jogar {p0}?\nID da sala {p1}\n{p2}", "{p0}\n{p1} · Pontuação {p2}\n{p3}"],
  "zh-Hans": ["来一起玩{p0}吧！\n房间 ID {p1}\n{p2}", "{p0}\n{p1} · 得分 {p2}\n{p3}"],
  fr: ["Joue à {p0} avec moi !\nIdentifiant du salon {p1}\n{p2}", "{p0}\n{p1} · Score {p2}\n{p3}"],
  de: ["Spiel {p0} mit mir!\nRaum-ID {p1}\n{p2}", "{p0}\n{p1} · Punktzahl {p2}\n{p3}"],
  ko: ["{p0}에서 함께 대전하자!\n방 ID {p1}\n{p2}", "{p0}\n{p1} · 점수 {p2}\n{p3}"],
  ru: ["Сыграй со мной в {p0}!\nКод комнаты {p1}\n{p2}", "{p0}\n{p1} · Очки {p2}\n{p3}"],
  it: ["Gioca a {p0} con me!\nID stanza {p1}\n{p2}", "{p0}\n{p1} · Punteggio {p2}\n{p3}"],
  "zh-Hant": ["來一起玩{p0}吧！\n房間 ID {p1}\n{p2}", "{p0}\n{p1} · 得分 {p2}\n{p3}"],
  id: ["Ayo main {p0} denganku!\nID ruang {p1}\n{p2}", "{p0}\n{p1} · Skor {p2}\n{p3}"],
  tr: ["Benimle {p0} oyna!\nOda kodu {p1}\n{p2}", "{p0}\n{p1} · Skor {p2}\n{p3}"],
  vi: ["Chơi {p0} cùng mình nhé!\nMã phòng {p1}\n{p2}", "{p0}\n{p1} · Điểm {p2}\n{p3}"],
  th: ["มาเล่น {p0} ด้วยกัน!\nรหัสห้อง {p1}\n{p2}", "{p0}\n{p1} · คะแนน {p2}\n{p3}"]
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

export const onlineMessages = Object.fromEntries(Object.keys(interfaceText).map(language => {
  const keys = [...interfaceKeys, ...statusKeys, ...shareKeys, ...detailKeys];
  const values = [...interfaceText[language], ...statusText[language], ...shareText[language], ...detailText[language]];
  if (keys.length !== values.length) throw new Error(`Incomplete translation: ${language}`);
  return [language, Object.fromEntries(keys.map((key, index) => [key, values[index]]))];
}));
