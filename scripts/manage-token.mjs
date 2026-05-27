import "./load-env.mjs";

const [, , command, ...args] = process.argv;

function usage() {
  console.error("用法:");
  console.error("  npm run token -- create <名称> [有效天数]");
  console.error("  npm run token -- delete <名称或token>");
  console.error("  npm run token -- list");
}

function formatDate(value) {
  if (!value) return "永不过期";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

try {
  const {
    createTemporaryToken,
    databasePath,
    deleteTemporaryToken,
    listTemporaryTokens
  } = await import("../lib/auth-db.js");

  if (command === "create") {
    const [name, daysArg] = args;
    if (!name) {
      usage();
      process.exit(1);
    }

    const token = createTemporaryToken(name, { days: daysArg || 7 });
    console.log(`已创建临时 Token: ${token.name}`);
    console.log(`Token: ${token.token}`);
    console.log(`过期时间: ${formatDate(token.expiresAt)}`);
    console.log(`数据库: ${databasePath()}`);
    console.log("请妥善保存 Token，之后不会再次显示明文。");
  } else if (command === "delete") {
    const [identifier] = args;
    if (!identifier) {
      usage();
      process.exit(1);
    }

    const changes = deleteTemporaryToken(identifier);
    if (changes === 0) {
      console.error("未找到匹配的临时 Token。");
      process.exit(1);
    }

    console.log(`已删除 ${changes} 个临时 Token`);
  } else if (command === "list") {
    const tokens = listTemporaryTokens();
    if (tokens.length === 0) {
      console.log("暂无临时 Token。");
    } else {
      for (const token of tokens) {
        console.log(`${token.name}\t过期时间: ${formatDate(token.expiresAt)}\t创建时间: ${token.createdAt}`);
      }
    }
    console.log(`数据库: ${databasePath()}`);
  } else {
    usage();
    process.exit(1);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
