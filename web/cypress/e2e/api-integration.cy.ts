/// <reference types="cypress" />

const API_BASE = "http://localhost:4000/api";
const FRONTEND = "http://localhost:8080";

const SEED = {
  superAdmin: { email: "superadmin@example.com", password: "SuperAdmin123!", role: "super-admin" },
  admin: { email: "admin@example.com", password: "Admin1234!", role: "admin" },
  client: { email: "client@example.com", password: "Client123!", role: "client" },
};

function apiLogin(email, password, role) {
  return cy.request({
    method: "POST",
    url: `${API_BASE}/auth/login/${role}`,
    body: { email, password },
    failOnStatusCode: false,
  });
}

function apiGet(path, token) {
  return cy.request({
    method: "GET",
    url: `${API_BASE}${path}`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    failOnStatusCode: false,
  });
}

function apiPost(path, body) {
  return cy.request({
    method: "POST",
    url: `${API_BASE}${path}`,
    body,
    failOnStatusCode: false,
  });
}

describe("Investment Platform — API Integration E2E (frontend ↔ backend)", () => {
  it("client can log in and access dashboard data", () => {
    apiLogin(SEED.client.email, SEED.client.password, SEED.client.role).then((login) => {
      expect(login.status).to.eq(200);
      const token = login.body.data.accessToken;
      apiGet("/dashboard/client", token).then((dash) => {
        expect(dash.status).to.eq(200);
        expect(dash.body.data.summary).to.have.property("totalInvested");
        expect(dash.body.data.summary).to.have.property("projectedReturn");
        expect(dash.body.data.summary).to.have.property("averageInterestRate");
      });
    });
  });

  it("client session refresh works", () => {
    apiLogin(SEED.client.email, SEED.client.password, SEED.client.role).then((login) => {
      expect(login.status).to.eq(200);
      apiPost("/auth/refresh", { refreshToken: login.body.data.refreshToken }).then((refresh) => {
        expect(refresh.status).to.eq(200);
      });
    });
  });

  it("super admin can access system-wide data", () => {
    cy.clearCookies();
    cy.wait(3000);
    apiLogin(SEED.superAdmin.email, SEED.superAdmin.password, SEED.superAdmin.role).then((login) => {
      expect(login.status).to.eq(200);
      const token = login.body.data.accessToken;
      apiGet("/dashboard/admin", token).then((dash) => {
        expect(dash.status).to.eq(200);
      });
      apiGet("/admin/clients", token).then((clients) => {
        expect(clients.status).to.eq(200);
      });
      apiGet("/admin/admins", token).then((admins) => {
        expect(admins.status).to.eq(200);
      });
      apiGet("/admin/assignments", token).then((assignments) => {
        expect(assignments.status).to.eq(200);
      });
      apiGet("/admin/prices", token).then((prices) => {
        expect(prices.status).to.eq(200);
      });
      apiGet("/admin/audit", token).then((audit) => {
        expect(audit.status).to.eq(200);
      });
    });
  });

  it("admin is restricted from super-admin-only routes", () => {
    apiLogin(SEED.admin.email, SEED.admin.password, SEED.admin.role).then((login) => {
      expect(login.status).to.eq(200);
      const token = login.body.data.accessToken;
      apiGet("/admin/admins", token).then((admins) => {
        expect(admins.status).to.not.eq(200);
      });
    });
  });

  it("published prices endpoint returns data without authentication", () => {
    apiGet("/prices").then((prices) => {
      expect(prices.status).to.eq(200);
    });
  });

  it("invalid credentials are rejected", () => {
    apiLogin("nonexistent@example.com", "wrongpassword", "client").then((login) => {
      expect(login.status).to.eq(401);
    });
  });
});

describe("Investment Platform — UI E2E (frontend rendering)", () => {
  it("login page loads with sign-in form", () => {
    cy.visit("/login");
    cy.contains("Sign in").should("be.visible");
    cy.url().should("include", "/login");
  });

  it("unauthenticated portal access redirects to login", () => {
    cy.visit("/portal");
    cy.url().should("include", "/login");
  });

  it("unauthenticated admin access redirects to login", () => {
    cy.visit("/admin");
    cy.url().should("include", "/login");
  });

  it("frontend dev server is reachable", () => {
    cy.request(FRONTEND).its("status").should("eq", 200);
  });

  it("backend API is reachable", () => {
    cy.request(`${API_BASE}/prices`).its("status").should("eq", 200);
  });
});
