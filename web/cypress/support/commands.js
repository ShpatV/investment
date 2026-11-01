/// <reference types="cypress" />

const ENV = Cypress.config("env") || {};
const API_BASE = ENV.apiBaseUrl || "http://localhost:4000/api";

let accessToken = null;
let refreshToken = null;
let portal = "client";

// Custom commands for authentication and API helpers

Cypress.Commands.add("login", (email, password, p = "client") => {
  portal = p;
  cy.request("POST", `${API_BASE}/auth/login/${p}`, {
    email,
    password,
  }).then((response) => {
    expect(response.status).to.eq(200);
    accessToken = response.body.data.accessToken;
    refreshToken = response.body.data.refreshToken;
  });
});

// Visit an authenticated portal route with the refresh token pre-injected
// into localStorage so the frontend restores the authenticated session.
Cypress.Commands.add("visitAuthed", (path) => {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem("avencrestcorp.auth.refreshToken", refreshToken);
      win.localStorage.setItem("avencrestcorp.auth.portal", portal);
    },
  });
});

Cypress.Commands.add("logout", () => {
  if (refreshToken) {
    cy.request("POST", `${API_BASE}/auth/logout`, { refreshToken });
  }
  accessToken = null;
  refreshToken = null;
});

Cypress.Commands.add("apiGet", (path) => {
  return cy.request({
    method: "GET",
    url: `${API_BASE}${path}`,
    headers: { Authorization: `Bearer ${accessToken || ""}` },
    failOnStatusCode: false,
  });
});

Cypress.Commands.add("apiPost", (path, body) => {
  return cy.request({
    method: "POST",
    url: `${API_BASE}${path}`,
    headers: {
      Authorization: `Bearer ${accessToken || ""}`,
      "Content-Type": "application/json",
    },
    body,
    failOnStatusCode: false,
  });
});

Cypress.Commands.add("apiPatch", (path, body) => {
  return cy.request({
    method: "PATCH",
    url: `${API_BASE}${path}`,
    headers: {
      Authorization: `Bearer ${accessToken || ""}`,
      "Content-Type": "application/json",
    },
    body,
    failOnStatusCode: false,
  });
});

Cypress.Commands.add("apiDelete", (path) => {
  return cy.request({
    method: "DELETE",
    url: `${API_BASE}${path}`,
    headers: { Authorization: `Bearer ${accessToken || ""}` },
    failOnStatusCode: false,
  });
});
