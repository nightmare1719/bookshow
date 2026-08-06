const mockDbService = require('../Services/mockDbService');

/**
 * Returns a Proxy around the mongoose model. When global.USE_IN_MEMORY_FALLBACK
 * is enabled, every operation transparently delegates to the corresponding
 * in-memory MockModel so controllers work unchanged without MongoDB.
 */
const createDualModel = (mockKey, mongooseModel) => {
  const mock = mockDbService[mockKey];
  return new Proxy(mongooseModel, {
    get(target, prop, receiver) {
      if (global.USE_IN_MEMORY_FALLBACK && mock && mock[prop] !== undefined) {
        const val = mock[prop];
        if (typeof val === 'function') return val.bind(mock);
        return val;
      }
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') return val.bind(target);
      return val;
    }
  });
};

module.exports = createDualModel;
