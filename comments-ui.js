/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MOOVIED COMMENTS SYSTEM — Netflix-Style UI/UX
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * • Real-time comment loading
 * • Add, edit, delete comments
 * • Like comments
 * • Reply to comments
 * • User profile integration
 * • Responsive design
 * • Smooth animations
 */

class CommentsSystem {
  constructor(containerId, movieId, apiUrl = '/api') {
    this.container = document.getElementById(containerId);
    this.movieId = movieId;
    this.apiUrl = apiUrl;
    this.comments = [];
    this.currentUser = this.getCurrentUser();
    this.isLoading = false;
    this.init();
  }

  getCurrentUser() {
    try {
      const session = localStorage.getItem('moovied_session');
      return session ? JSON.parse(session) : null;
    } catch (e) {
      return null;
    }
  }

  async init() {
    this.render();
    await this.loadComments();
  }

  async loadComments() {
    try {
      this.isLoading = true;
      const response = await fetch(`${this.apiUrl}/comments?movieId=${this.movieId}`);
      const data = await response.json();
      this.comments = data.comments || [];
      this.renderComments();
      this.isLoading = false;
    } catch (error) {
      console.error('Failed to load comments:', error);
      this.isLoading = false;
    }
  }

  render() {
    const html = `
      <div class="mvd-comments-section">
        <div class="mvd-comments-header">
          <h3 class="mvd-comments-title">Comments</h3>
          <span class="mvd-comments-count">${this.comments.length}</span>
        </div>

        ${this.currentUser ? `
          <div class="mvd-comment-input-wrapper">
            <div class="mvd-comment-input-box">
              <div class="mvd-comment-input-avatar">
                <img src="${this.currentUser.avatar_url || this.getDefaultAvatar()}" alt="${this.currentUser.name}">
              </div>
              <div class="mvd-comment-input-field">
                <textarea 
                  id="mvd-comment-input" 
                  class="mvd-comment-textarea"
                  placeholder="Share your thoughts about this movie..."
                  rows="3"
                ></textarea>
                <div class="mvd-comment-input-actions">
                  <button id="mvd-comment-submit" class="mvd-btn mvd-btn-primary">Post Comment</button>
                  <button id="mvd-comment-cancel" class="mvd-btn mvd-btn-secondary">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        ` : `
          <div class="mvd-comment-login-prompt">
            <p>Sign in to share your thoughts</p>
            <button class="mvd-btn mvd-btn-primary" onclick="window.location.href = '/#/login'">Sign In</button>
          </div>
        `}

        <div class="mvd-comments-list" id="mvd-comments-list">
          <div class="mvd-loading">Loading comments...</div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    
    if (this.currentUser) {
      this.attachInputEvents();
    }
  }

  attachInputEvents() {
    const submitBtn = document.getElementById('mvd-comment-submit');
    const cancelBtn = document.getElementById('mvd-comment-cancel');
    const input = document.getElementById('mvd-comment-input');

    submitBtn.addEventListener('click', () => this.submitComment());
    cancelBtn.addEventListener('click', () => {
      input.value = '';
      input.blur();
    });

    input.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        this.submitComment();
      }
    });
  }

  async submitComment() {
    const input = document.getElementById('mvd-comment-input');
    const content = input.value.trim();

    if (!content) {
      alert('Please write a comment');
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movie_id: this.movieId,
          user_id: this.currentUser.id,
          user_name: this.currentUser.name,
          content: content
        })
      });

      const data = await response.json();
      if (data.success) {
        input.value = '';
        await this.loadComments();
      } else {
        alert('Failed to post comment');
      }
    } catch (error) {
      console.error('Error posting comment:', error);
      alert('Error posting comment');
    }
  }

  renderComments() {
    const list = document.getElementById('mvd-comments-list');

    if (this.comments.length === 0) {
      list.innerHTML = '<div class="mvd-no-comments">No comments yet. Be the first to comment!</div>';
      return;
    }

    list.innerHTML = this.comments
      .map((comment) => this.renderComment(comment))
      .join('');

    // Attach event listeners to all comments
    this.comments.forEach((comment) => {
      this.attachCommentEvents(comment.id);
    });
  }

  renderComment(comment) {
    const isOwner = this.currentUser && this.currentUser.id === comment.user_id;
    const timeAgo = this.formatTimeAgo(new Date(comment.timestamp));

    return `
      <div class="mvd-comment-item" data-comment-id="${comment.id}">
        <div class="mvd-comment-avatar">
          <img src="${this.getDefaultAvatar()}" alt="${comment.user_name}">
        </div>

        <div class="mvd-comment-content">
          <div class="mvd-comment-header">
            <div class="mvd-comment-info">
              <span class="mvd-comment-author">${this.escapeHtml(comment.user_name)}</span>
              <span class="mvd-comment-time">${timeAgo}</span>
              ${comment.edited ? '<span class="mvd-comment-edited">(edited)</span>' : ''}
            </div>
            ${isOwner ? `
              <div class="mvd-comment-actions">
                <button class="mvd-comment-action-btn edit-btn" title="Edit">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                  </svg>
                </button>
                <button class="mvd-comment-action-btn delete-btn" title="Delete">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
            ` : ''}
          </div>

          <p class="mvd-comment-text" id="comment-text-${comment.id}">${this.escapeHtml(comment.content)}</p>

          <div class="mvd-comment-footer">
            <button class="mvd-comment-like-btn" title="Like this comment">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span class="mvd-comment-like-count">${comment.likes}</span>
            </button>

            ${this.currentUser ? `
              <button class="mvd-comment-reply-btn" title="Reply to this comment">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></polyline>
                </svg>
                Reply
              </button>
            ` : ''}
          </div>

          <div class="mvd-comment-edit-form" id="edit-form-${comment.id}" style="display:none;">
            <textarea class="mvd-comment-edit-textarea">${this.escapeHtml(comment.content)}</textarea>
            <div class="mvd-comment-edit-actions">
              <button class="mvd-btn mvd-btn-small save-edit-btn">Save</button>
              <button class="mvd-btn mvd-btn-secondary mvd-btn-small cancel-edit-btn">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachCommentEvents(commentId) {
    const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (!commentEl) return;

    // Like button
    const likeBtn = commentEl.querySelector('.mvd-comment-like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', () => this.likeComment(commentId));
    }

    // Edit button
    const editBtn = commentEl.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.showEditForm(commentId));
    }

    // Delete button
    const deleteBtn = commentEl.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteComment(commentId));
    }

    // Save edit button
    const saveEditBtn = commentEl.querySelector('.save-edit-btn');
    if (saveEditBtn) {
      saveEditBtn.addEventListener('click', () => this.saveEdit(commentId));
    }

    // Cancel edit button
    const cancelEditBtn = commentEl.querySelector('.cancel-edit-btn');
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => this.hideEditForm(commentId));
    }

    // Reply button
    const replyBtn = commentEl.querySelector('.mvd-comment-reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => this.replyToComment(commentId));
    }
  }

  showEditForm(commentId) {
    const editForm = document.getElementById(`edit-form-${commentId}`);
    const commentText = document.getElementById(`comment-text-${commentId}`);
    if (editForm && commentText) {
      commentText.style.display = 'none';
      editForm.style.display = 'block';
    }
  }

  hideEditForm(commentId) {
    const editForm = document.getElementById(`edit-form-${commentId}`);
    const commentText = document.getElementById(`comment-text-${commentId}`);
    if (editForm && commentText) {
      editForm.style.display = 'none';
      commentText.style.display = 'block';
    }
  }

  async saveEdit(commentId) {
    const editForm = document.getElementById(`edit-form-${commentId}`);
    const textarea = editForm?.querySelector('.mvd-comment-edit-textarea');
    const newContent = textarea?.value.trim();

    if (!newContent) {
      alert('Comment cannot be empty');
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
      });

      const data = await response.json();
      if (data.success) {
        await this.loadComments();
      } else {
        alert('Failed to update comment');
      }
    } catch (error) {
      console.error('Error updating comment:', error);
      alert('Error updating comment');
    }
  }

  async deleteComment(commentId) {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      const response = await fetch(`${this.apiUrl}/comments/${commentId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        await this.loadComments();
      } else {
        alert('Failed to delete comment');
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Error deleting comment');
    }
  }

  async likeComment(commentId) {
    try {
      const response = await fetch(`${this.apiUrl}/comments/${commentId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      if (data.success) {
        const likeBtn = document.querySelector(`[data-comment-id="${commentId}"] .mvd-comment-like-count`);
        if (likeBtn) {
          likeBtn.textContent = data.likes || 0;
        }
      }
    } catch (error) {
      console.error('Error liking comment:', error);
    }
  }

  replyToComment(commentId) {
    const comment = this.comments.find(c => c.id === commentId);
    if (!comment) return;

    const input = document.getElementById('mvd-comment-input');
    if (input) {
      input.focus();
      input.value = `@${comment.user_name} `;
      input.setAttribute('data-reply-to', commentId);
    }
  }

  getDefaultAvatar() {
    return 'https://ui-avatars.com/api/?name=User&background=FFD700&color=000';
  }

  formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('mvd-comments-section');
  const movieId = document.querySelector('[data-movie-id]')?.getAttribute('data-movie-id');
  
  if (container && movieId) {
    window.commentsSystem = new CommentsSystem('mvd-comments-section', movieId);
  }
});
