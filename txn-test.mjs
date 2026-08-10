import initSqlJs from 'sql.js'
const SQL = await initSqlJs({ locateFile: (f) => 'node_modules/sql.js/dist/' + f })
const db = new SQL.Database()
try {
  db.run('BEGIN TRANSACTION')
  console.log('BEGIN ok')
  db.run('CREATE TABLE t (a INT)')
  db.run('COMMIT')
  console.log('COMMIT ok')
} catch (e) { console.log('ERR:', e.message) }
try {
  db.run('-- comment line 1\n-- comment line 2\nBEGIN TRANSACTION')
  db.run('CREATE TABLE t2 (a INT)')
  db.run('COMMIT')
  console.log('chunked BEGIN ok')
} catch (e) { console.log('ERR2:', e.message) }
