#!/usr/bin/env node
// Creates (or updates) an app user with a role, and optionally links a student to their tutor.
// Run by the "Add user" GitHub workflow; can also run locally with the same env vars.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (never ship this key in the app)
// Args: --email a@b.c --role student|tutor [--name "Display name"] [--tutor-email t@b.c]
//
// Accounts are created already confirmed and without an invitation link: the person simply opens the
// app and signs in with the 6-digit code emailed to them (the app never creates accounts itself).
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    role: { type: 'string' },
    name: { type: 'string', default: '' },
    'tutor-email': { type: 'string', default: '' },
  },
});

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
const email = (args.email ?? '').trim().toLowerCase();
const role = args.role;
const tutorEmail = (args['tutor-email'] ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('a valid --email is required');
if (role !== 'student' && role !== 'tutor') fail('--role must be student or tutor');
if (tutorEmail && role !== 'student') fail('--tutor-email only applies to students');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(address) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`listing users failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === address);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

let userId = await findUserId(email);
if (userId) {
  console.log('ℹ user already exists — updating role and name');
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role, display_name: args.name },
  });
  if (error) fail(`creating user failed: ${error.message}`);
  userId = data.user.id;
  console.log('✔ user created');
}

// The profile row is created by a database trigger; set role and name explicitly (also for existing users).
const profileUpdate = { role, ...(args.name ? { display_name: args.name.slice(0, 80) } : {}) };
const { error: profileError } = await admin.from('profiles').update(profileUpdate).eq('id', userId);
if (profileError) fail(`updating profile failed: ${profileError.message}`);
console.log(`✔ role set to ${role}`);

if (tutorEmail) {
  const tutorId = await findUserId(tutorEmail);
  if (!tutorId) fail('tutor not found — add the tutor first');
  const { error } = await admin
    .from('tutor_students')
    .upsert({ tutor_id: tutorId, student_id: userId }, { onConflict: 'tutor_id,student_id', ignoreDuplicates: true });
  if (error) fail(`linking to tutor failed: ${error.message}`);
  console.log('✔ linked to tutor');
}

console.log('Done. They can now open the app and sign in with the code emailed to them.');
