const config = require(`config`)

const pgp = require(`pg-promise`)()
const StorageInterface = require(`./StorageInterface.js`)

const transactionColumnSet = new pgp.helpers.ColumnSet([`transaction_hash`, `block_number`], { table: `blockchain_transactions` })
const eventColumnSet = new pgp.helpers.ColumnSet([`contract_name`, `event_name`, `log_index`, `event`, `transaction_hash`, `return_values`], { table: `blockchain_events` })

class PostgresStorage extends StorageInterface {
  constructor () {
    super()
    this.db = pgp({
      user: config.get(`storage.user`),
      host: config.get(`storage.host`),
      database: config.get(`storage.database`),
      password: config.get(`storage.password`),
      port: config.get(`storage.port`)
    })
  }

  async save (contractName, events, deleteExisting = false) {
    const transactionRows = []
    const eventRows = []

    events.forEach((event) => {
      transactionRows.push({
        transaction_hash: event.transactionHash,
        block_number: event.blockNumber
      })
      eventRows.push({
        contract_name: contractName,
        event_name: event.event,
        log_index: event.logIndex,
        event,
        transaction_hash: event.transactionHash,
        return_values: event.returnValues
      })
    })

    return this.db.tx((t) => {
      const transactionQuery = `${pgp.helpers.insert(transactionRows, transactionColumnSet)}ON CONFLICT ON CONSTRAINT blockchain_transactions_transaction_hash_pk DO NOTHING`
      const eventQuery = `${pgp.helpers.insert(eventRows, eventColumnSet)}ON CONFLICT ON CONSTRAINT blockchain_events_transaction_hash_log_index_pk DO NOTHING`

      let deleteTransactions
      if (deleteExisting) {
        const transactionHashes = events.map(event => event.transactionHash)
        deleteTransactions = t.none(`DELETE FROM blockchain_transactions WHERE contract_name = $1 AND transaction_hash = ANY($2)`, [contractName, transactionHashes])
      }

      const insertTransactions = t.none(transactionQuery)
      const insertEvents = t.none(eventQuery)

      const queries = []
      if (deleteTransactions) {
        queries.push(deleteTransactions)
      }
      queries.push(insertTransactions)
      queries.push(insertEvents)

      return t.batch(queries)
    })
  }

  async getEvents (args) {
    const queryArgs = [args.limit]
    let query = `
        SELECT * FROM blockchain_transactions t, blockchain_events e
        WHERE t.transaction_hash = e.transaction_hash`
    if(args.contractName) {
      queryArgs.push(args.contractName)
      query += ` AND contract_name = $${queryArgs.length}`
    }
    if(args.eventName) {
      queryArgs.push(args.eventName)
      query += ` AND event_name = $${queryArgs.length}`
    }
    const order = args.order === -1 ? `DESC` : `ASC`
    const orderLimit = ` ORDER BY t.block_number ${order} LIMIT $1`
    const events = await this.db.any(query + orderLimit, queryArgs)
    return PostgresStorage.transformEvents(events)
  }

  async findByReturnValues (args) {
    const query = `
        SELECT t.block_number, e.event_name, e.return_values
        FROM blockchain_transactions t, blockchain_events e
        WHERE t.transaction_hash = e.transaction_hash AND
        (e.return_values->>'${args.key}' = $1
        ORDER BY t.block_number;`
    const events = await this.db.any(query, args.value)
    return PostgresStorage.transformEvents(events)
  }

  async getKittyHistory (kittyId) {
    const query = `
        SELECT t.block_number, e.event_name, e.return_values
        FROM blockchain_transactions t, blockchain_events e
        WHERE t.transaction_hash = e.transaction_hash AND
        (e.return_values->>'kittyId' = $1 OR
         e.return_values->>'matronId' = $1 OR
         e.return_values->>'sireId' = $1 OR
         e.return_values->>'tokenId' = $1)
        ORDER BY t.block_number;`
    const events = await this.db.any(query, kittyId)
    return PostgresStorage.transformEvents(events)
  }

  static transformEvents (events) {
    events.forEach((event) => {
      Object.keys(event).forEach((key) => {
        const camelCasedKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase())
        event[camelCasedKey] = event[key]
        delete event[key]
      })
    })
    return events
  }
}

module.exports = PostgresStorage
