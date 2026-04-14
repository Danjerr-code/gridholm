import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase.js';
import { getPackInventory, removePack } from './packGenerator.js';

/**
 * Manages pack credits for authenticated and guest users.
 *
 * Authenticated users: reads/writes `pack_credits` on the `profiles` table.
 *   - `inventory.mixed` reflects the Supabase credit count; faction-specific counts are 0.
 *   - All 4 faction packs show `pack_credits` as available (via the mixed credit logic).
 *
 * Guest users: delegates to the existing localStorage inventory unchanged.
 */
export function usePackCredits(currentUser) {
  const [supabaseCredits, setSupabaseCredits] = useState(null); // null = not yet loaded
  const [loading, setLoading] = useState(!!(currentUser && supabase));

  useEffect(() => {
    if (!currentUser || !supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('profiles')
      .select('pack_credits')
      .eq('id', currentUser.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data != null) {
          setSupabaseCredits(data.pack_credits ?? 0);
        } else {
          setSupabaseCredits(0);
        }
        setLoading(false);
      });
  }, [currentUser]);

  // Build the inventory shape that PackOpeningScreen expects.
  // For auth users, pack_credits maps to the "mixed" slot so all faction
  // packs show the correct available count via the existing mixed-credit logic.
  const inventory = currentUser
    ? { light: 0, primal: 0, mystic: 0, dark: 0, mixed: supabaseCredits ?? 0 }
    : getPackInventory();

  /**
   * Consume one credit when a pack is opened.
   * For auth users: decrements pack_credits in Supabase (read-then-write — safe
   *   because pack opening is a sequential user action).
   * For guests: removes one pack from localStorage inventory.
   */
  const consumeCredit = useCallback(async (packType) => {
    if (currentUser && supabase) {
      const { data } = await supabase
        .from('profiles')
        .select('pack_credits')
        .eq('id', currentUser.id)
        .single();

      const current = data?.pack_credits ?? 0;
      if (current > 0) {
        const next = current - 1;
        await supabase
          .from('profiles')
          .update({ pack_credits: next })
          .eq('id', currentUser.id);
        setSupabaseCredits(next);
      }
    } else {
      // Guest: consume faction-specific first, fall back to mixed
      const inv = getPackInventory();
      if ((inv[packType] || 0) > 0) {
        removePack(packType);
      } else {
        removePack('mixed');
      }
    }
  }, [currentUser]);

  /**
   * Re-sync from the source of truth (useful after returning to select screen).
   * For guests, inventory is always read fresh from localStorage so no-op.
   */
  const refreshInventory = useCallback(async () => {
    if (currentUser && supabase) {
      const { data } = await supabase
        .from('profiles')
        .select('pack_credits')
        .eq('id', currentUser.id)
        .single();
      if (data != null) {
        setSupabaseCredits(data.pack_credits ?? 0);
      }
    }
    // For guests, getPackInventory() reads localStorage fresh on every call;
    // PackOpeningScreen re-reads via inventory getter on next render.
  }, [currentUser]);

  return { inventory, loading, consumeCredit, refreshInventory };
}
