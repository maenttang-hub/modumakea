import { cookies } from 'next/headers';
import { ProjectCollaborationProvider } from '@/components/collaboration/project-collaboration-provider';
import { ProjectCommentsProvider } from '@/components/comments/project-comments-provider';
import { LanguageBootstrap } from '@/components/app/language-bootstrap';
import HomeShell from '@/components/app/home-shell';
import { APP_LANGUAGE_COOKIE, resolveAppLanguage } from '@/lib/ui-language';

export default async function SharedProjectPage({
  params,
}: PageProps<'/p/[id]'>) {
  const { id } = await params;
  const cookieStore = await cookies();
  const initialAppLanguage = resolveAppLanguage(cookieStore.get(APP_LANGUAGE_COOKIE)?.value);

  return (
    <ProjectCollaborationProvider>
      <ProjectCommentsProvider>
        <LanguageBootstrap initialAppLanguage={initialAppLanguage} />
        <HomeShell initialCloudProjectId={id} initialAppLanguage={initialAppLanguage} />
      </ProjectCommentsProvider>
    </ProjectCollaborationProvider>
  );
}
