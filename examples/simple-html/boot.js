const statusNode = document.querySelector("#status");
const runtimeNote = document.querySelector("#runtime-note");

if (window.location.protocol === "file:") {
  runtimeNote?.classList.remove("hidden");
  statusNode.textContent =
    "This page cannot run from file://. Start the local demo server and reopen it over HTTP.";
  statusNode.classList.add("error");
} else {
  import("./app.js").catch((error) => {
    statusNode.textContent = `Failed to load the demo: ${
      error instanceof Error ? error.message : String(error)
    }`;
    statusNode.classList.add("error");
  });
}
