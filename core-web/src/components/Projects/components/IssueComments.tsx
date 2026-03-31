import { useAuthStore } from '../../../stores/authStore';
import CommentItem from './CommentItem';
import CommentComposer from './CommentComposer';
import {
  useIssueComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
  useAddCommentReaction,
  useRemoveCommentReaction,
  type ContentBlock,
} from '../../../hooks/queries/useProjects';

interface IssueCommentsProps {
  issueId: string;
}

export default function IssueComments({ issueId }: IssueCommentsProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);

  // React Query hooks
  const { data: comments = [], isLoading: isLoadingComments } = useIssueComments(issueId);
  const createComment = useCreateComment(issueId);
  const updateComment = useUpdateComment(issueId);
  const deleteComment = useDeleteComment(issueId);
  const addReaction = useAddCommentReaction(issueId);
  const removeReaction = useRemoveCommentReaction(issueId);

  const handleSend = async (blocks: ContentBlock[]) => {
    await createComment.mutateAsync(blocks);
  };

  const handleEdit = (commentId: string, blocks: ContentBlock[]) => {
    updateComment.mutate({ commentId, blocks });
  };

  const handleDelete = (commentId: string) => {
    deleteComment.mutate(commentId);
  };

  const handleReact = (commentId: string, emoji: string) => {
    addReaction.mutate({ commentId, emoji });
  };

  const handleRemoveReact = (commentId: string, emoji: string) => {
    removeReaction.mutate({ commentId, emoji });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="pb-2 flex-shrink-0">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Actividad
          {comments.length > 0 && (
            <span className="ml-1.5 text-gray-300">({comments.length})</span>
          )}
        </h3>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoadingComments && comments.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? null : (
          <div className="divide-y divide-gray-100">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                currentUserId={currentUserId}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReact={handleReact}
                onRemoveReact={handleRemoveReact}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <CommentComposer onSend={handleSend} disabled={createComment.isPending} />
    </div>
  );
}
