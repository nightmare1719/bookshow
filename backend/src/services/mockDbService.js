class MockModel {
  constructor() {
    this.store = [];
  }

  async findById(id) {
    const item = this.store.find(x => String(x._id) === String(id));
    return item ? { ...item, organizerId: item.organizerId || 'mock-org' } : null;
  }

  async find(query = {}) {
    return this.store.filter(item => {
      for (const [key, value] of Object.entries(query)) {
        if (String(item[key]) !== String(value)) return false;
      }
      return true;
    });
  }

  async findOne(query = {}) {
    const results = await this.find(query);
    return results[0] || null;
  }
}

const mockDbService = {
  seats: new MockModel(),
  events: new MockModel(),
};

// Seed mockDbService with helper method for populating test data
mockDbService.addSeat = (seat) => {
  mockDbService.seats.store.push(seat);
};

mockDbService.addEvent = (event) => {
  mockDbService.events.store.push(event);
};

module.exports = mockDbService;
