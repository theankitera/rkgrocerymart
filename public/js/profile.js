/**
 * profile.js — Rinku Kirana
 * User profile + saved addresses (Supabase)
 * ─────────────────────────────────────────────────────────────
 * Public API (window.RKProfile):
 *   loadProfile(userId)        → profile object | null
 *   updateProfile(userId, data)
 *   loadAddresses(userId)      → [address]
 *   saveAddress(userId, addr)  → saved address
 *   deleteAddress(userId, id)
 *   setDefaultAddress(userId, id)
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const getDB = () => window.sb;

  /* ══════════════════════════════════════════════════════════
     PROFILE
  ══════════════════════════════════════════════════════════ */

  /**
   * Load or auto-create a profile row.
   * Called after login / session restore.
   */
  async function loadProfile(userId) {
    if (!userId) return null;

    const { data, error } = await getDB()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Row doesn't exist yet — create it
      return await _createProfile(userId);
    }
    if (error) {
      console.error('[RKProfile] loadProfile:', error.message);
      return null;
    }
    return data;
  }

  async function _createProfile(userId) {
    const { data: authData } = await getDB().auth.getUser();
    const meta = authData?.user?.user_metadata || {};
    const email = authData?.user?.email || '';

    const newProfile = {
      id: userId,
      name: meta.name || email.split('@')[0] || 'User',
      email,
      phone: meta.phone || '',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await getDB()
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();

    if (error) {
      console.error('[RKProfile] _createProfile:', error.message);
      // Don't pretend this saved — return null so callers know to fall back
      // gracefully instead of treating an unsaved object as persisted truth.
      return null;
    }
    return data;
  }

  /**
   * Update profile fields.
   * @param {string} userId
   * @param {{ name?, phone?, avatar_url? }} data
   */
  async function updateProfile(userId, data) {
    if (!userId) return null;

    const payload = { ...data, updated_at: new Date().toISOString() };
    const { data: updated, error } = await getDB()
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .single();

    if (error) { console.error('[RKProfile] updateProfile:', error.message); return null; }
    return updated;
  }

  /* ══════════════════════════════════════════════════════════
     ADDRESSES
  ══════════════════════════════════════════════════════════ */

  /** Load all saved addresses for user */
  async function loadAddresses(userId) {
    if (!userId) return [];

    const { data, error } = await getDB()
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) { console.error('[RKProfile] loadAddresses:', error.message); return []; }
    return data || [];
  }

  /**
   * Save a new address or update existing.
   * @param {string} userId
   * @param {{ id?, label, line1, line2?, city, pincode, is_default? }} addr
   */
  async function saveAddress(userId, addr) {
    if (!userId) return null;

    const payload = {
      user_id: userId,
      label: addr.label || 'Home',
      line1: addr.line1 || '',
      line2: addr.line2 || '',
      city: addr.city || '',
      pincode: addr.pincode || '',
      is_default: addr.is_default || false,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (addr.id) {
      // Update
      const { data, error } = await getDB()
        .from('addresses')
        .update(payload)
        .eq('id', addr.id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) { console.error('[RKProfile] saveAddress (update):', error.message); return null; }
      result = data;
    } else {
      // Insert
      const { data, error } = await getDB()
        .from('addresses')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) { console.error('[RKProfile] saveAddress (insert):', error.message); return null; }
      result = data;
    }

    // Only unset other addresses' default flag AFTER the new/edited one is
    // confirmed saved — avoids ending up with zero default addresses if this
    // step fails partway through.
    if (addr.is_default && result) {
      await getDB()
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', userId)
        .neq('id', result.id);
    }

    return result;
  }

  /** Delete an address. If the deleted address was the default, auto-promote
   *  another saved address (most recently created) to default so the
   *  account never ends up with zero default addresses. */
  async function deleteAddress(userId, addressId) {
    if (!userId || !addressId) return;

    const { data: deletedRow } = await getDB()
      .from('addresses')
      .select('is_default')
      .eq('id', addressId)
      .eq('user_id', userId)
      .single();

    const { error } = await getDB()
      .from('addresses')
      .delete()
      .eq('id', addressId)
      .eq('user_id', userId);

    if (error) { console.error('[RKProfile] deleteAddress:', error.message); return; }

    if (deletedRow && deletedRow.is_default) {
      const { data: remaining } = await getDB()
        .from('addresses')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (remaining && remaining.length) {
        await getDB()
          .from('addresses')
          .update({ is_default: true, updated_at: new Date().toISOString() })
          .eq('id', remaining[0].id)
          .eq('user_id', userId);
      }
    }
  }

  /** Mark an address as default */
  async function setDefaultAddress(userId, addressId) {
    if (!userId || !addressId) return;
    // Unset all
    await getDB().from('addresses').update({ is_default: false }).eq('user_id', userId);
    // Set new default
    const { error } = await getDB()
      .from('addresses')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', addressId)
      .eq('user_id', userId);
    if (error) console.error('[RKProfile] setDefaultAddress:', error.message);
  }

  /* ══════════════════════════════════════════════════════════
     EXPOSE
  ══════════════════════════════════════════════════════════ */
  window.RKProfile = {
    loadProfile,
    updateProfile,
    loadAddresses,
    saveAddress,
    deleteAddress,
    setDefaultAddress,
  };

})();
