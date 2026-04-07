import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useStudioStore } from '../../stores/studioStore';
import StudioAppList from './StudioAppList';
import StudioEditor from './StudioEditor';

export default function StudioView() {
  const { workspaceId, appId, pageId } = useParams<{
    workspaceId: string;
    appId?: string;
    pageId?: string;
  }>();

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const wid = workspaceId || activeWorkspaceId;

  const { setWorkspaceId, setActiveApp, setActivePage, activeAppId } = useStudioStore();

  useEffect(() => {
    if (wid) setWorkspaceId(wid);
  }, [wid, setWorkspaceId]);

  useEffect(() => {
    if (appId && appId !== activeAppId) setActiveApp(appId);
  }, [appId, activeAppId, setActiveApp]);

  useEffect(() => {
    if (pageId) setActivePage(pageId);
  }, [pageId, setActivePage]);

  if (!appId) {
    return <StudioAppList workspaceId={wid} />;
  }

  return <StudioEditor />;
}
