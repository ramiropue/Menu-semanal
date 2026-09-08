import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST || "localhost",
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: process.env.DATABASE_USER || "menu_user",
  password: process.env.DATABASE_PASSWORD || "menu_pass_2024",
  database: process.env.DATABASE_NAME || "menu_semanal",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Asegurar que JSON se parsee automáticamente
  typeCast: function (field: any, next: any) {
    if (field.type === "JSON") {
      const val = field.string();
      if (val === null) return null;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return next();
  },
});

export default pool;
