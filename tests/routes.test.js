import test from 'node:test';
import assert from 'node:assert/strict';

const { app } = await import('../server/index.js');

const baseUrl = 'http://127.0.0.1:3001';

const request = async (method, path, body, token) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : {},
  };
};

test('GET /api/health returns ok', async () => {
  const response = await request('GET', '/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

test('GET /api/dashboard without token fails', async () => {
  const response = await request('GET', '/api/dashboard');
  assert.equal(response.status, 401);
  assert.ok(response.body.error);
});

test('POST /api/register creates a user and token', async () => {
  const email = `route-${Date.now()}@example.com`;
  const response = await request('POST', '/api/register', {
    name: 'Route User',
    email,
    password: 'secret123',
  });

  assert.equal(response.status, 201);
  assert.ok(response.body.token);
  assert.equal(response.body.user.email, email);
});
