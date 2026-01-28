import admin from '../config/firebase.js';
import supabase from '../config/db.js';

class NotificationService {
  /**
   * Save notification to database
   */
  async saveNotification(data) {
    try {
      const { data: notification, error } = await supabase
        .from('notifications')
        .insert({
          institution_id: data.institutionId,
          user_id: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          priority: data.priority || 'medium',
          related_id: data.relatedId,
          related_type: data.relatedType,
          metadata: data.metadata || {},
          action_url: data.actionUrl,
          action_label: data.actionLabel,
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving notification:', error);
        throw error;
      }

      console.log('✅ Notification saved to DB:', notification.id);
      return notification;
    } catch (error) {
      console.error('❌ Save notification error:', error);
      throw error;
    }
  }

  /**
   * Get active push tokens for user or institution
   * IMPORTANT: Also validates notifications_enabled for users
   */
  async getPushTokens(userId, institutionId = null) {
    try {
      console.log(`🔍 getPushTokens called: userId=${userId}, institutionId=${institutionId}`);
      
      // If user_id provided, check notifications_enabled first
      if (userId) {
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('notifications_enabled, last_donation_date')
          .eq('id', userId)
          .single();

        if (userError || !user) {
          console.log(`⚠️  User not found or error fetching user: ${userId}`);
          return [];
        }

        // Check if notifications disabled
        if (user.notifications_enabled === false) {
          console.log(`🚫 User ${userId} has notifications disabled`);
          return [];
        }

        // Check if user is within 3-month post-donation period
        if (user.last_donation_date) {
          const lastDonation = new Date(user.last_donation_date);
          const nextEligible = new Date(lastDonation.getTime() + 90 * 24 * 60 * 60 * 1000);
          const today = new Date();

          if (nextEligible > today) {
            console.log(`⏸️  User ${userId} is within 3-month post-donation period`);
            return [];
          }
        }

        console.log(`✅ User ${userId} is eligible to receive notifications`);
      }
      
      let query = supabase.from('push_tokens').select('token, platform, device_id').eq('active', true);
      
      if (userId) {
        query = query.eq('user_id', userId);
        console.log(`🔍 Querying for user_id: ${userId}`);
      } else if (institutionId) {
        query = query.eq('institution_id', institutionId);
        console.log(`🔍 Querying for institution_id: ${institutionId}`);
      } else {
        console.log('🔍 No userId or institutionId provided');
        return [];
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching push tokens:', error);
        return [];
      }

      console.log(`📊 Found ${(data || []).length} push tokens`);
      if (data && data.length > 0) {
        console.log(`📊 Tokens: ${JSON.stringify(data)}`);
      }
      
      return data || [];
    } catch (error) {
      console.error('❌ Get push tokens error:', error);
      return [];
    }
  }

  /**
   * Send FCM push notification
   */
  async sendPushNotification(tokens, notification) {
    // Check if Firebase is initialized
    if (!admin.apps.length) {
      console.warn('⚠️  Firebase not initialized. Skipping push notification.');
      return { success: false, message: 'Firebase not configured' };
    }

    if (!tokens || tokens.length === 0) {
      console.log('ℹ️  No device tokens found');
      return { success: false, message: 'No tokens' };
    }

    try {
      const message = {
        notification: {
          title: notification.title,
          body: notification.message,
        },
        data: {
          type: notification.type || 'request',
          priority: notification.priority || 'medium',
          related_id: notification.related_id || '',
          related_type: notification.related_type || '',
          action_url: notification.action_url || '',
          ...(notification.metadata || {}),
        },
      };

      // Send to multiple tokens
      const promises = tokens.map(({ token }) =>
        admin
          .messaging()
          .send({ ...message, token })
          .catch((error) => ({ error, token }))
      );

      const results = await Promise.allSettled(promises);

      const successCount = results.filter((r) => r.status === 'fulfilled' && !r.value.error).length;
      const failedCount = results.filter((r) => r.status === 'rejected' || r.value?.error).length;

      console.log(`📲 Push notifications: ${successCount} sent, ${failedCount} failed`);

      // Remove invalid tokens
      const invalidTokens = results
        .map((result, index) => {
          if (result.status === 'fulfilled' && result.value?.error) {
            const errorCode = result.value.error.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              return tokens[index].token;
            }
          }
          return null;
        })
        .filter(Boolean);

      if (invalidTokens.length > 0) {
        await this.deactivateTokens(invalidTokens);
      }

      // Update notification status
      await supabase
        .from('notifications')
        .update({ push_sent: true })
        .eq('id', notification.id);

      return {
        success: true,
        successCount,
        failedCount,
        invalidTokens: invalidTokens.length,
      };
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deactivate invalid push tokens
   */
  async deactivateTokens(tokens) {
    try {
      const { error } = await supabase
        .from('push_tokens')
        .update({ active: false })
        .in('token', tokens);

      if (error) {
        console.error('❌ Error deactivating tokens:', error);
      } else {
        console.log(`🗑️  Deactivated ${tokens.length} invalid tokens`);
      }
    } catch (error) {
      console.error('❌ Deactivate tokens error:', error);
    }
  }

  /**
   * Get institution email preferences
   */
  async getInstitutionEmailSettings(institutionId) {
    try {
      const { data, error } = await supabase
        .from('institutions')
        .select('notification_email, email_notifications, institution_name, email')
        .eq('id', institutionId)
        .single();

      if (error) {
        console.error('❌ Error fetching institution email settings:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Get email settings error:', error);
      return null;
    }
  }

  /**
   * Send email notification (placeholder - implement with nodemailer or service)
   */
  async sendEmailNotification(institutionId, notification) {
    try {
      const institution = await this.getInstitutionEmailSettings(institutionId);

      if (!institution || !institution.email_notifications) {
        console.log('ℹ️  Email notifications disabled for institution');
        return { success: false, message: 'Email disabled' };
      }

      const emailTo = institution.notification_email || institution.email;

      // TODO: Implement actual email sending with nodemailer or AWS SES
      console.log(`📧 Email notification would be sent to: ${emailTo}`);
      console.log(`   Title: ${notification.title}`);
      console.log(`   Message: ${notification.message}`);

      // Update notification status
      await supabase
        .from('notifications')
        .update({ email_sent: true })
        .eq('id', notification.id);

      return {
        success: true,
        message: 'Email logged (not sent - implement email service)',
        emailTo,
      };
    } catch (error) {
      console.error('❌ Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Main notification sender - handles all channels
   */
  async notify(params) {
    try {
      const {
        institutionId,
        userId,
        type,
        title,
        message,
        priority = 'medium',
        relatedId,
        relatedType,
        metadata,
        actionUrl,
        actionLabel,
        sendEmail = false,
        sendPush = true,
      } = params;

      // 1. Save to database
      const notification = await this.saveNotification({
        institutionId,
        userId,
        type,
        title,
        message,
        priority,
        relatedId,
        relatedType,
        metadata,
        actionUrl,
        actionLabel,
      });

      const results = {
        notificationId: notification.id,
        database: true,
        push: null,
        email: null,
        metadata: notification.metadata,  // ✅ ADD THIS to return metadata
      };

      // 2. Send push notification if enabled and user/institution provided
      if (sendPush && (userId || institutionId)) {
        const tokens = await this.getPushTokens(userId, institutionId);
        if (tokens.length > 0) {
          console.log(`🔔 Found ${tokens.length} push tokens for ${userId ? 'user' : 'institution'}`);
          results.push = await this.sendPushNotification(tokens, notification);
        } else {
          results.push = { success: false, message: 'No tokens registered' };
          console.log(`⚠️  No push tokens found for ${userId || institutionId}`);
        }
      }

      // 3. Send email for high/critical priority or if explicitly requested
      if ((sendEmail || priority === 'high' || priority === 'critical') && institutionId) {
        results.email = await this.sendEmailNotification(institutionId, notification);
      }

      console.log('✅ Notification sent:', {
        id: notification.id,
        title: notification.title,
        push: results.push?.success || false,
        email: results.email?.success || false,
      });

      return results;
    } catch (error) {
      console.error('❌ Notify error:', error);
      throw error;
    }
  }

  /**
   * Send notification to multiple institutions
   */
  async notifyMultiple(institutionIds, notificationData) {
    try {
      const promises = institutionIds.map((institutionId) =>
        this.notify({
          ...notificationData,
          institutionId,
        })
      );

      const results = await Promise.allSettled(promises);

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;

      console.log(`📬 Bulk notifications: ${successCount} sent, ${failedCount} failed`);

      return { successCount, failedCount, results };
    } catch (error) {
      console.error('❌ Notify multiple error:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) {
        console.error('❌ Error marking notification as read:', error);
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Mark as read error:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for institution
   */
  async markAllAsRead(institutionId) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('institution_id', institutionId)
        .eq('is_read', false);

      if (error) {
        console.error('❌ Error marking all notifications as read:', error);
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Mark all as read error:', error);
      throw error;
    }
  }

  /**
   * Get notifications for institution
   */
  async getNotifications(institutionId, options = {}) {
    try {
      const { limit = 50, offset = 0, unreadOnly = false } = options;

      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('❌ Error fetching notifications:', error);
        throw error;
      }

      return { notifications: data, total: count };
    } catch (error) {
      console.error('❌ Get notifications error:', error);
      throw error;
    }
  }

  /**
   * Register/update push token
   */
  async registerPushToken(params) {
    try {
      const { institutionId, userId, token, platform, deviceId } = params;
      
      console.log(`📝 registerPushToken: userId=${userId}, institutionId=${institutionId}, token=${token.substring(0, 20)}...`);

      // Check if token already exists
      const { data: existing } = await supabase
        .from('push_tokens')
        .select('id, user_id, institution_id')
        .eq('token', token)
        .single();

      if (existing) {
        // Update existing token - MUST include user_id and institution_id
        console.log(`📝 Updating existing token: id=${existing.id}`);
        const { error } = await supabase
          .from('push_tokens')
          .update({
            user_id: userId,
            institution_id: institutionId,
            platform,
            device_id: deviceId,
            active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;

        console.log(`✅ Push token updated for ${userId ? 'user' : 'institution'}`);
        return { success: true, action: 'updated' };
      } else {
        // Insert new token
        console.log(`📝 Inserting new token`);
        const { error } = await supabase.from('push_tokens').insert({
          institution_id: institutionId,
          user_id: userId,
          token,
          platform,
          device_id: deviceId,
          active: true,
        });

        if (error) throw error;

        console.log(`✅ Push token registered for ${userId ? 'user' : 'institution'}`);
        return { success: true, action: 'created' };
      }
    } catch (error) {
      console.error('❌ Register push token error:', error);
      throw error;
    }
  }

  /**
   * Unregister push token
   */
  async unregisterPushToken(token) {
    try {
      const { error } = await supabase
        .from('push_tokens')
        .update({ active: false })
        .eq('token', token);

      if (error) throw error;

      console.log('✅ Push token unregistered');
      return { success: true };
    } catch (error) {
      console.error('❌ Unregister push token error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new NotificationService();
