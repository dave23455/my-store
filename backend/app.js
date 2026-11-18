import("./dist/server.js").catch((error) => {
  console.error("The LinaStyledYou API failed to start.", error);
  process.exit(1);
});