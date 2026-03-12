/**
 * events.js - Atmospheric event log system
 * Fires random flavour messages at intervals, maintaining a scrolling log
 */
export class EventLog {
  constructor(maxLines = 6) {
    this.maxLines = maxLines;
    this.lines = [];
    this.timer = 0;
    this.nextEventIn = this._randomInterval();
    // Batched queued messages
    this._queue = [];
  }

  _randomInterval() {
    // 30 to 120 real seconds
    return 30 + Math.random() * 90;
  }

  update(dt) {
    this.timer += dt;
    let result = null;
    if (this.timer >= this.nextEventIn) {
      this.timer = 0;
      this.nextEventIn = this._randomInterval();
      result = this._fireRandom();
    }
    // Drain manual queue
    while (this._queue.length > 0) {
      this._addLine(this._queue.shift());
    }
    return result;
  }

  _fireRandom() {
    const msgs = ATMOSPHERIC_MESSAGES;
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    // Small chance of a money event
    if (Math.random() < 0.08) {
      this._addLine('Znalazłeś dolara! +$1');
      return { money: 1 };
    }
    this._addLine(msg);
    return null;
  }

  _addLine(text) {
    this.lines.push({ text, age: 0, timestamp: Date.now() });
    if (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
  }

  /** Push a game event message immediately */
  push(text) {
    this._queue.push(text);
  }

  /** Get visible lines (most recent at bottom) */
  getLines() {
    return this.lines;
  }
}

const ATMOSPHERIC_MESSAGES = [
  'Wlazłeś w kupę. Pech.',
  'Z okna śmierdzi smażoną cebulą.',
  'Jakiś dzieciak patrzy na Ciebie podejrzliwie.',
  'Policyjny radiowóz przejechał powoli... i odjechał.',
  'Ktoś krzyczy w oddali. Nie twój problem.',
  'Weszłeś do niebezpiecznej dzielnicy. Uważaj.',
  'Deszcz zaczyna padać. Jak zawsze.',
  'Neonowe światła migają rytmicznie.',
  'Gdzieś w oddali słychać muzykę. Basy.',
  'Kot patrzy na Ciebie z pogardą.',
  'Zegarek na wieży bije północ.',
  'Smród spalin. Klasyka.',
  'Ktoś rzuca niedopałkiem przez okno.',
  'Bezdomny macha do Ciebie. Nie odpowiadasz.',
  'Hulajnoga elektryczna o mało Cię nie rozjechała.',
  'W śmietniku ktoś majstruje przy czymś.',
  'Autobus przejeżdża pusty o 3 w nocy.',
  'Napis na murze: "SYSTEM TO WRÓG".',
  'Czujesz coś na ramieniu. Okazuje się, że to ptak.',
  'Ktoś płacze za zamkniętymi drzwiami.',
  'Plakat wyborczy jest podziurawiony.',
  'Zapach kebaba z rogu ulicy. Kusi.',
  'Pijak śpiewa coś po rosyjsku.',
  'Znalazłeś starą gazetę. Nagłówek: "POLICJA BEZRADNA".',
  'Reflektor samochodowy oślepia Cię na chwilę.',
  'Coś szeleści w zaroślach. Prawdopodobnie szczur.',
  'Kroki za Tobą. Oglądasz się. Nic.',
  'Hydrofornia znowu nie działa. Normalne.',
  'Ktoś zrzuca butelkę z okna na trzecim piętrze.',
  'Dwie osoby kłócą się przez ścianę.',
  'W kiosku właściciel śpi z gazetą na twarzy.',
  'Alarm samochodowy wyje od kwadransa.',
  'Latarnia miga w rytmie serca.',
  'SMS od nieznanego numeru. Kasujesz.',
  'Coś kapie z rury nad głową. Lepiej nie wiedzieć co.',
  'Zmęczony taksówkarz patrzy na Ciebie pytająco.',
  'Graffiti: "Wszyscy kłamią".',
  'Na ławce leży czyjaś torba. Nie ruszasz jej.',
  'Syrena karetki w oddali. Ktoś ma gorzej.',
  'Okno otwiera się i zamyka w wietrze.',
  'Migające czerwone światło na szczycie budynku.',
  'Dron przelatuje nisko. Obserwuje?',
  'Na ziemi leży rozbite lustro. Siedem lat...',
  'Przekraczasz granicę między dzielnicami.',
  'Ktoś oferuje Ci papieros. Odmawiasz (albo nie).',
  'Ściek bulgocze niepokojąco.',
  'Zegar na banku pokazuje złą godzinę od tygodnia.',
  'W wystawie sklepu widać Twoje odbicie.',
  'Skrzydło gołębia musnęło Twoje ucho.',
  'Ktoś rzuca monetą do fontanny. Zepsuta fontanna.',
  'Na rogu stoi facet w płaszczu. Patrzy.',
  'Dziecko na rowerze mknie przez ulicę bez świateł.',
  'Zapach palonej gumy z parkingu.',
  'Znowu ta sama melodia w głowie. Skąd ją znasz?',
  'Mgła opada na miasto jak całun.',
  'Satelita przemieszcza się cicho przez nocne niebo.',
  'Ktoś gra w szachy sam ze sobą przy oknie.',
];
