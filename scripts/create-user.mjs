import "./load-env.mjs";

const [, , usernameArg, passwordArg] = process.argv;
const username = usernameArg || process.env.ADMIN_USERNAME;
const password = passwordArg || process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error("用法: npm run create-user -- <账号> <密码>");
  console.error("也可以设置 ADMIN_USERNAME 和 ADMIN_PASSWORD 环境变量。");
  process.exit(1);
}

try {
  const { createUser, databasePath, userCount } = await import("../lib/auth-db.js");
  const user = createUser(username, password);
  console.log(`已创建用户: ${user.username}`);
  console.log(`数据库: ${databasePath()}`);
  console.log(`用户总数: ${userCount()}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
