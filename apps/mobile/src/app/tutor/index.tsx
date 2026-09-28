import { useSession } from '@/auth/session';
import { useT } from '@/i18n';
import { Button, Card, Screen, Title } from '@/ui/components';

export default function TutorHome() {
  const t = useT();
  const { signOut } = useSession();
  return (
    <Screen>
      <Title>{t.tutorHome}</Title>
      <Card title={t.tutorLessons} subtitle={t.tutorLessonsBody} />
      <Card title={t.tutorReview} subtitle={t.tutorReviewBody} />
      <Card title={t.tutorProgress} subtitle={t.tutorProgressBody} />
      <Button label={t.signOut} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
