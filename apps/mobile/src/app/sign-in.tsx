import { useState } from 'react';

import { useSession } from '@/auth/session';
import { useT } from '@/i18n';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/ui/components';

export default function SignIn() {
  const { backend, sendCode, verifyCode, devSignIn } = useSession();
  const t = useT();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  if (backend === 'dev') {
    return (
      <Screen>
        <Title>{t.appName}</Title>
        <Body muted>{t.devMode}</Body>
        <Button label={t.continueAsStudent} onPress={() => devSignIn('student')} />
        <Button label={t.continueAsTutor} variant="secondary" onPress={() => devSignIn('tutor')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t.signIn}</Title>
      <Body muted>{t.inviteOnly}</Body>
      <Field label={t.email} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" />
      {codeSent ? (
        <>
          <Field label={t.code} value={code} onChangeText={setCode} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
          <Button label={t.verify} busy={busy} onPress={() => void run(() => verifyCode(email.trim(), code.trim()))} />
        </>
      ) : (
        <Button label={t.sendCode} busy={busy} onPress={() => void run(async () => { await sendCode(email.trim()); setCodeSent(true); })} />
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </Screen>
  );
}
