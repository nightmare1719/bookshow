const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const AppError = require('../Utils/AppError');

const newObjectId = () => new mongoose.Types.ObjectId();

const getPath = (obj, expr) => {
  const key = String(expr).replace(/^\$/, '');
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
};

const project = (doc, fields) => {
  if (!fields) return doc;
  const set = new Set(fields.split(/\s+/).filter(Boolean));
  const out = {};
  for (const k of Object.keys(doc)) {
    if (k === '_id' || set.has(k)) out[k] = doc[k];
  }
  return out;
};

/**
 * Chainable query wrapper that mimics the mongoose Query API for the small
 * subset used across the app (find/findOne/findById + sort/skip/limit/select/
 * lean/populate/session). It is thenable so it can be awaited directly.
 */
class MockQuery {
  constructor(model, kind, query) {
    this.model = model;
    this.kind = kind; // 'many' | 'one' | 'count'
    this.query = query;
    this._sort = null;
    this._skip = 0;
    this._limit = Infinity;
    this._select = null;
    this._populates = [];
    this._lean = false;
  }

  sort(sort) {
    if (typeof sort === 'string') {
      const fields = [];
      const parts = sort.trim().split(/\s+/);
      for (let i = 0; i + 1 < parts.length; i += 2) {
        fields.push([parts[i], parts[i + 1] === 'desc' ? -1 : 1]);
      }
      this._sort = fields;
    } else if (sort) {
      this._sort = Object.entries(sort);
    }
    return this;
  }

  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = n; return this; }
  lean() { this._lean = true; return this; }
  select(fields) { this._select = fields; return this; }
  populate(path, select) { this._populates.push({ path, select }); return this; }
  session() { return this; }

  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.exec().catch(onRejected);
  }

  async exec() {
    let docs = this.model._findRaw(this.query);

    if (this._sort) {
      const sortKeys = this._sort;
      docs = docs.slice().sort((a, b) => {
        for (const [key, dir] of sortKeys) {
          const av = a[key];
          const bv = b[key];
          if (av == null && bv == null) continue;
          if (av == null) return dir;
          if (bv == null) return -dir;
          if (av < bv) return -dir;
          if (av > bv) return dir;
        }
        return 0;
      });
    }

    if (this._skip > 0) docs = docs.slice(this._skip);
    if (isFinite(this._limit)) docs = docs.slice(0, this._limit);

    if (this.kind === 'count') return docs.length;

    let out;
    if (this._select) out = docs.map((d) => this.model._selectDoc(d, this._select));
    else if (this._lean) out = docs.map((d) => this.model._toPlain(d));
    else out = docs;

    out = out.map((d) => this.model._applyPopulate(d, this._populates));

    if (this.kind === 'one') return out[0] || null;
    return out;
  }
}

class MockModel {
  constructor(options = {}) {
    this.options = options; // { name, methods, beforeSave, beforeCreate, refMap }
    this.store = [];
  }

  _newId() {
    return newObjectId();
  }

  _makeDoc(input) {
    const doc = { ...input };
    if (doc._id === undefined) {
      doc._id = this._newId();
    } else if (!(doc._id instanceof mongoose.Types.ObjectId)) {
      try {
        doc._id = new mongoose.Types.ObjectId(String(doc._id));
      } catch (_) {
        doc._id = this._newId();
      }
    }

    for (const [name, fn] of Object.entries(this.options.methods || {})) {
      Object.defineProperty(doc, name, {
        value: fn.bind(doc),
        enumerable: false,
        writable: true,
        configurable: true
      });
    }

    doc.save = async (opts) => {
      if (this.options.beforeSave) await this.options.beforeSave.call(doc, doc);
      return doc;
    };
    Object.defineProperty(doc, 'toJSON', {
      value: () => this._toPlain(doc),
      enumerable: false,
      writable: true,
      configurable: true
    });

    return doc;
  }

  _toPlain(doc) {
    const out = {};
    for (const [k, v] of Object.entries(doc)) {
      if (typeof v === 'function') continue;
      out[k] = v;
    }
    return out;
  }

  _selectDoc(doc, select) {
    const fields = select.split(/\s+/).filter(Boolean);
    const hasExclude = fields.some((f) => f.startsWith('-'));
    const out = {};
    for (const [k, v] of Object.entries(doc)) {
      if (typeof v === 'function') continue;
      if (hasExclude) {
        if (!fields.includes(`-${k}`)) out[k] = v;
      } else if (k === '_id' || fields.includes(k)) {
        out[k] = v;
      }
    }
    return out;
  }

  _matchOperator(value, cond) {
    for (const [op, opVal] of Object.entries(cond)) {
      if (op === '$in') {
        if (!opVal.some((v) => String(value) === String(v))) return false;
      } else if (op === '$nin') {
        if (opVal.some((v) => String(value) === String(v))) return false;
      } else if (op === '$ne') {
        if (String(value) === String(opVal)) return false;
      } else if (op === '$gt') {
        if (!(value > opVal)) return false;
      } else if (op === '$gte') {
        if (!(value >= opVal)) return false;
      } else if (op === '$lt') {
        if (!(value < opVal)) return false;
      } else if (op === '$lte') {
        if (!(value <= opVal)) return false;
      } else if (op === '$exists') {
        if (opVal ? value === undefined : value !== undefined) return false;
      } else if (op === '$size') {
        if (!Array.isArray(value) || value.length !== opVal) return false;
      } else if (op === '$all') {
        if (!Array.isArray(value) || !opVal.every((v) => value.some((x) => String(x) === String(v)))) return false;
      } else if (op === '$eq') {
        if (String(value) !== String(opVal)) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  _matchDoc(doc, query) {
    for (const [key, cond] of Object.entries(query || {})) {
      if (key === '$text') {
        const terms = String((cond && cond.$search) || '').toLowerCase().split(/\s+/).filter(Boolean);
        const text = `${doc.title || ''} ${doc.description || ''}`.toLowerCase();
        if (!terms.every((t) => text.includes(t))) return false;
        continue;
      }

      const value = getPath(doc, key);

      if (
        cond && typeof cond === 'object' && !Array.isArray(cond) &&
        !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))
      ) {
        if (!this._matchOperator(value, cond)) return false;
        continue;
      }

      if (cond === null || cond === undefined) {
        if (value !== null && value !== undefined) return false;
        continue;
      }

      if (String(value) !== String(cond)) return false;
    }
    return true;
  }

  _findRaw(query = {}) {
    return this.store.filter((d) => this._matchDoc(d, query));
  }

  _findRawById(id) {
    return this.store.find((d) => String(d._id) === String(id)) || null;
  }

  _getPopulateModel(path) {
    const refKey = (this.options.refMap || {})[path];
    return refKey ? mockDbService[refKey] : null;
  }

  _applyPopulate(doc, populates) {
    if (!populates.length) return doc;
    const out = { ...doc };
    for (const { path, select } of populates) {
      const refValue = doc[path];
      if (refValue == null) continue;
      const isArray = Array.isArray(refValue);
      const ids = isArray ? refValue : [refValue];
      const refModel = this._getPopulateModel(path);
      if (!refModel) continue;
      const refs = ids.map((id) => {
        const found = refModel._findRawById(id);
        if (!found) return null;
        return project(refModel._toPlain(found), select);
      });
      out[path] = isArray ? refs : refs[0];
    }
    return out;
  }

  find(query = {}) {
    return new MockQuery(this, 'many', query);
  }

  findOne(query = {}) {
    return new MockQuery(this, 'one', query);
  }

  findById(id) {
    return new MockQuery(this, 'one', { _id: id });
  }

  countDocuments(query = {}) {
    return new MockQuery(this, 'count', query);
  }

  async create(data) {
    const isArray = Array.isArray(data);
    const arr = isArray ? data : [data];
    const docs = [];
    for (const input of arr) {
      const doc = this._makeDoc(input);
      if (this.options.beforeCreate) await this.options.beforeCreate.call(doc, doc);
      if (this.options.beforeSave) await this.options.beforeSave.call(doc, doc);
      this.store.push(doc);
      docs.push(doc);
    }
    return isArray ? docs : docs[0];
  }

  async insertMany(docs, opts = {}) {
    const arr = Array.isArray(docs) ? docs : [docs];
    const out = [];
    for (const input of arr) {
      const doc = this._makeDoc(input);
      if (this.options.beforeCreate) await this.options.beforeCreate.call(doc, doc);
      if (this.options.beforeSave) await this.options.beforeSave.call(doc, doc);
      this.store.push(doc);
      out.push(doc);
    }
    return out;
  }

  _applyUpdate(doc, update) {
    for (const [op, fields] of Object.entries(update || {})) {
      if (op === '$set') {
        Object.assign(doc, fields);
      } else if (op === '$inc') {
        for (const [k, v] of Object.entries(fields)) doc[k] = (doc[k] || 0) + v;
      } else if (op === '$push') {
        for (const [k, v] of Object.entries(fields)) {
          if (!doc[k]) doc[k] = [];
          doc[k].push(v);
        }
      } else if (op === '$unset') {
        for (const k of Object.keys(fields)) delete doc[k];
      }
    }
    return doc;
  }

  async updateMany(query, update) {
    const matched = this._findRaw(query);
    for (const doc of matched) this._applyUpdate(doc, update);
    return { matchedCount: matched.length, modifiedCount: matched.length };
  }

  async findByIdAndUpdate(id, update, opts = {}) {
    const doc = this._findRawById(id);
    if (!doc) return null;
    this._applyUpdate(doc, update);
    if (this.options.beforeSave) await this.options.beforeSave.call(doc, doc);
    return opts.new ? this._toPlain(doc) : doc;
  }

  async findOneAndUpdate(query, update, opts = {}) {
    const doc = this._findRaw(query)[0];
    if (!doc) return null;
    this._applyUpdate(doc, update);
    if (this.options.beforeSave) await this.options.beforeSave.call(doc, doc);
    return opts.new ? this._toPlain(doc) : doc;
  }

  async deleteMany(query = {}) {
    const before = this.store.length;
    this.store = this.store.filter((d) => !this._matchDoc(d, query));
    return { deletedCount: before - this.store.length };
  }

  async aggregate(pipeline = []) {
    let data = this.store.map((d) => this._toPlain(d));
    for (const stage of pipeline) {
      const op = Object.keys(stage)[0];
      const val = stage[op];
      if (op === '$match') {
        data = data.filter((d) => this._matchDoc(d, val));
      } else if (op === '$lookup') {
        const refModel = mockDbService[val.from];
        const fromStore = refModel ? refModel.store : [];
        data = data.map((d) => ({
          ...d,
          [val.as]: fromStore.filter((f) => String(getPath(f, val.foreignField)) === String(getPath(d, val.localField)))
        }));
      } else if (op === '$unwind') {
        const pathKey = String(val).replace(/^\$/, '');
        const out = [];
        for (const d of data) {
          if (Array.isArray(d[pathKey])) {
            for (const sub of d[pathKey]) out.push({ ...d, [pathKey]: sub });
          } else if (d[pathKey]) {
            out.push({ ...d, [pathKey]: d[pathKey] });
          }
        }
        data = out;
      } else if (op === '$group') {
        const idExpr = val._id;
        const groups = new Map();
        for (const d of data) {
          const key = idExpr === null ? '__all__' : String(getPath(d, idExpr) ?? '');
          if (!groups.has(key)) groups.set(key, { _id: idExpr === null ? null : key });
          const g = groups.get(key);
          for (const [field, expr] of Object.entries(val)) {
            if (field === '_id') continue;
            g[field] = (g[field] || 0) + this._groupValue(d, expr);
          }
        }
        data = [...groups.values()];
      } else if (op === '$sort') {
        const sortKeys = Object.entries(val);
        data.sort((a, b) => {
          for (const [k, dir] of sortKeys) {
            const av = a[k];
            const bv = b[k];
            if (av == null && bv == null) continue;
            if (av == null) return dir;
            if (bv == null) return -dir;
            if (av < bv) return -dir;
            if (av > bv) return dir;
          }
          return 0;
        });
      }
    }
    return data;
  }

  _groupValue(doc, expr) {
    if (expr.$sum) {
      const operand = expr.$sum;
      if (operand === 1) return 1;
      if (operand && typeof operand === 'object') {
        if (operand.$cond) {
          const [cond, thenV, elseV] = operand.$cond;
          return this._evalCond(doc, cond) ? (Number(getPath(doc, thenV)) || 0) : (Number(getPath(doc, elseV)) || 0);
        }
        return 0;
      }
      return Number(getPath(doc, operand)) || 0;
    }
    if (expr.$size) {
      const arr = getPath(doc, expr.$size);
      return Array.isArray(arr) ? arr.length : 0;
    }
    return 0;
  }

  _evalCond(doc, cond) {
    if (cond && cond.$eq) {
      return String(getPath(doc, cond.$eq[0])) === String(cond.$eq[1]);
    }
    return false;
  }
}

const userMethods = {
  async comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
  },
  creditWallet(amount, description) {
    this.walletBalance = (this.walletBalance || 0) + amount;
    if (!this.walletTransactions) this.walletTransactions = [];
    this.walletTransactions.push({ amount, type: 'credit', description, createdAt: new Date() });
    return this.save();
  },
  async debitWallet(amount, description) {
    if ((this.walletBalance || 0) < amount) {
      throw new AppError('Insufficient wallet balance to complete this booking.', 400);
    }
    this.walletBalance = (this.walletBalance || 0) - amount;
    if (!this.walletTransactions) this.walletTransactions = [];
    this.walletTransactions.push({ amount, type: 'debit', description, createdAt: new Date() });
    return this.save();
  }
};

const eventMethods = {
  calculateDynamicPrice() {
    const demandFactor = this.demandFactor || 0;
    const total = this.totalSeats || 1;
    return Math.round((this.basePrice * (1 + (this.seatsSold || 0) / total * demandFactor)) * 100) / 100;
  }
};

const mockDbService = {
  users: new MockModel({
    name: 'User',
    methods: userMethods,
    beforeCreate: (doc) => {
      if (doc.password) doc._passwordChanged = true;
    },
    beforeSave: (doc) => {
      if (doc._passwordChanged) {
        doc.password = bcrypt.hashSync(doc.password, 10);
        delete doc._passwordChanged;
      }
    }
  }),
  events: new MockModel({
    name: 'Event',
    methods: eventMethods,
    beforeSave: (doc) => {
      doc.seatsSold = doc.seatsSold || 0;
      doc.dynamicPrice = doc.calculateDynamicPrice();
    }
  }),
  seats: new MockModel({
    name: 'Seat',
    refMap: { eventId: 'events' }
  }),
  bookings: new MockModel({
    name: 'Booking',
    refMap: { eventId: 'events', userId: 'users' }
  }),
  coupons: new MockModel({
    name: 'Coupon',
    methods: {
      isValid() {
        return this.isActive && this.expirationDate > new Date() && this.usedCount < this.maxUses;
      }
    }
  }),
  referrals: new MockModel({ name: 'Referral' }),
  notifications: new MockModel({ name: 'Notification' }),
  vendors: new MockModel({ name: 'Vendor' })
};

const generateSeatsForSeed = (eventId, totalSeats, basePrice, bookingType, showtime = '') => {
  const seats = [];
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  if (bookingType === 'zone') {
    for (let i = 1; i <= totalSeats; i++) {
      seats.push({ eventId, showtime, seatNumber: `General-${i}`, category: 'General', status: 'available', price: basePrice });
    }
  } else {
    const seatsPerRow = Math.ceil(totalSeats / rows.length);
    let count = 0;
    for (let r = 0; r < rows.length && count < totalSeats; r++) {
      for (let s = 1; s <= seatsPerRow && count < totalSeats; s++) {
        seats.push({ eventId, showtime, seatNumber: `${rows[r]}${s}`, category: 'General', status: 'available', price: basePrice });
        count++;
      }
    }
  }
  return seats;
};

const seedMockData = () => {
  if (mockDbService.users.store.length > 0) return;

  const day = 86400000;

  const organizer = mockDbService.users._makeDoc({
    email: 'organizer@demo.com',
    password: 'organizer123',
    role: 'organizer',
    profile: { firstName: 'Demo', lastName: 'Organizer', phone: '+91 90000 00001' },
    walletBalance: 0
  });
  organizer._passwordChanged = true;
  organizer.password = bcrypt.hashSync(organizer.password, 10);
  delete organizer._passwordChanged;
  mockDbService.users.store.push(organizer);

  const attendee = mockDbService.users._makeDoc({
    email: 'user@demo.com',
    password: 'user123',
    role: 'attendee',
    profile: { firstName: 'Demo', lastName: 'User', phone: '+91 90000 00002' },
    walletBalance: 2000,
    walletTransactions: [{ amount: 2000, type: 'credit', description: 'Demo wallet credit', createdAt: new Date() }]
  });
  attendee._passwordChanged = true;
  attendee.password = bcrypt.hashSync(attendee.password, 10);
  delete attendee._passwordChanged;
  mockDbService.users.store.push(attendee);

  const eventDefs = [
    {
      title: 'Tech Conference 2026',
      description: "Keynotes from the world's top engineers on AI, cloud and startups.",
      venue: 'Grand Convention Hall',
      date: new Date(Date.now() + 7 * day),
      category: 'Technology',
      basePrice: 500,
      totalSeats: 100,
      bookingType: 'seated',
      demandFactor: 0.5,
      image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
      showtimes: ['09:00 AM', '12:00 PM', '03:00 PM']
    },
    {
      title: 'Sunburn Music Festival',
      description: 'Two days of electronic music under the open sky with top DJs.',
      venue: 'Open Air Ground',
      date: new Date(Date.now() + 14 * day),
      category: 'Music',
      basePrice: 1500,
      totalSeats: 200,
      bookingType: 'zone',
      demandFactor: 0.8,
      image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745',
      showtimes: ['04:00 PM', '07:00 PM', '10:00 PM']
    },
    {
      title: 'Stand-Up Comedy Night',
      description: "A night of laughter with the country's funniest comedians.",
      venue: 'Laugh Club',
      date: new Date(Date.now() + 21 * day),
      category: 'Comedy',
      basePrice: 300,
      totalSeats: 60,
      bookingType: 'seated',
      demandFactor: 0.2,
      image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd6a',
      showtimes: ['06:00 PM', '09:00 PM']
    }
  ];

  for (const def of eventDefs) {
    const event = mockDbService.events._makeDoc({
      ...def,
      organizerId: organizer._id,
      seatsSold: 0,
      isActive: true
    });
    event.dynamicPrice = event.calculateDynamicPrice();
    mockDbService.events.store.push(event);

    const showtimes = def.showtimes || ['06:40 PM'];
    for (const time of showtimes) {
      const seats = generateSeatsForSeed(event._id, def.totalSeats, def.basePrice, def.bookingType, time);
      for (const seat of seats) {
        mockDbService.seats.store.push(mockDbService.seats._makeDoc(seat));
      }
    }
  }

  mockDbService.coupons.store.push(
    mockDbService.coupons._makeDoc({
      code: 'DEMO20',
      discountType: 'percentage',
      discountValue: 20,
      expirationDate: new Date(Date.now() + 30 * day),
      maxUses: 100,
      usedCount: 0,
      isActive: true
    })
  );

  const seedBookings = (title, seatCount, txnId) => {
    const event = mockDbService.events.store.find((e) => e.title === title);
    if (!event) return;
    const seats = mockDbService.seats.store
      .filter((s) => String(s.eventId) === String(event._id))
      .slice(0, seatCount);
    mockDbService.bookings.store.push(
      mockDbService.bookings._makeDoc({
        userId: attendee._id,
        eventId: event._id,
        seatIds: seats.map((s) => s._id),
        seatNumbers: seats.map((s) => s.seatNumber),
        totalAmount: seats.reduce((sum, s) => sum + s.price, 0),
        transactionId: txnId,
        status: 'confirmed',
        paymentMethod: 'mock',
        qrCode: '',
        couponCode: null,
        discountApplied: 0
      })
    );
    event.seatsSold = seats.length;
    event.dynamicPrice = event.calculateDynamicPrice();
    for (const s of seats) {
      s.status = 'booked';
      s.lockedBy = null;
      s.lockedUntil = null;
    }
  };

  seedBookings('Tech Conference 2026', 3, 'TXN-SEED-001');
  seedBookings('Sunburn Music Festival', 5, 'TXN-SEED-002');

  console.log('🌱 Seeded in-memory database with demo organizer, events, seats, coupon and bookings.');
};

seedMockData();

module.exports = mockDbService;
