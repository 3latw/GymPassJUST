// Match the synchronous database interface used by the shared gym rules.
// Cloudflare owns persistence; transactionSync supplies atomic rollback.
export function durableDatabase(storage) {
  const query = (sql, args) => storage.sql.exec(sql, ...args).toArray();
  return {
    exec(sql) { query(sql, []); },
    prepare(sql) {
      return {
        get(...args) { return query(sql, args)[0]; },
        all(...args) { return query(sql, args); },
        run(...args) {
          query(sql, args);
          return query("SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid", [])[0];
        },
      };
    },
    transactionSync(fn) { return storage.transactionSync(fn); },
    close() {},
  };
}
