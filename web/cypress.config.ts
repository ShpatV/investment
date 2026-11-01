import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    chromeWebSecurity: false,
    setupNodeEvents(on, config) {
      on("task", {
        log(message) {
          // eslint-disable-next-line no-console
          console.log("[CYPRUS-TASK]", message);
          return null;
        },
      });
      return config;
    },
  },
  env: {
    apiBaseUrl: "http://localhost:4000/api",
  },
});
