/* eslint class-methods-use-this: 0 */
class StorageInterface {
  processEvents (contractName, events, deleteExisting = false) {
    events.forEach(event => StorageInterface.removeRedundantReturnValues(event))
    return this.save(contractName, events, deleteExisting)
  }

  save (contractName, events, deleteExisting = false) {
    throw new Error(`Not implemented`)
  }

  getEvents (args) {
    throw new Error(`Not implemented`)
  }

  findByReturnValues (args) {
    throw new Error(`Not implemented`)
  }

  getKittyHistory (kittyId) {
    throw new Error(`Not implemented`)
  }

  static removeRedundantReturnValues (event) {
    for (let i = 0; i < Object.keys(event.returnValues).length; i++) {
      delete event.returnValues[i]
    }
  }
}

module.exports = StorageInterface
