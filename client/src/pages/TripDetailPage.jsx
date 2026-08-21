import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import TripSnapshotView from '../components/TripSnapshotView.jsx';
import TripHero, { HeroBadge } from '../components/cards/TripHero.jsx';
import { SectionError } from '../components/ui/SectionCard.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import {
  ArrowRightIcon,
  CheckIcon,
  LinkIcon,
  RefreshIcon,
  ShareIcon,
  SpinnerIcon,
  TrashIcon,
} from '../components/ui/Icons.jsx';

/**
 * A saved trip.
 *
 * Owner-only actions live here: refresh the snapshot, edit the notes, toggle a
 * public share link, delete. Packing ticks are persisted with a debounce so
 * checking off six items is one write, not six.
 */
export default function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: api.keys.trips.detail(id),
    queryFn: () => api.getTrip(id),
  });

  const trip = data?.data;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: api.keys.trips.detail(id) });
    queryClient.invalidateQueries({ queryKey: api.keys.trips.all });
  }, [queryClient, id]);

  const save = useMutation({
    mutationFn: (payload) => api.updateTrip(id, payload),
    onSuccess: () => invalidate(),
    onError: (saveError) => toast.error(saveError.message ?? 'Could not save changes'),
  });

  const refresh = useMutation({
    mutationFn: () => api.refreshTrip(id),
    onSuccess: () => {
      invalidate();
      toast.success('Snapshot re-captured from the live providers');
    },
    onError: (refreshError) => toast.error(refreshError.message ?? 'Could not refresh this trip'),
  });

  const share = useMutation({
    mutationFn: (enable) => (enable ? api.shareTrip(id) : api.unshareTrip(id)),
    onSuccess: async (result, enable) => {
      invalidate();
      if (enable && result?.token) {
        const url = `${window.location.origin}/share/${result.token}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success('Public link copied to your clipboard');
        } catch {
          // Clipboard access can be denied; the link is still visible on the page.
          toast.info('Public link created');
        }
      } else {
        toast.info('Sharing turned off');
      }
    },
    onError: (shareError) => toast.error(shareError.message ?? 'Could not update sharing'),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteTrip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: api.keys.trips.all });
      toast.success('Trip deleted');
      navigate('/trips');
    },
    onError: (deleteError) => toast.error(deleteError.message ?? 'Could not delete this trip'),
  });

  if (isLoading) {
    return (
      <div className="tm-page space-y-7">
        <Skeleton className="h-64 w-full" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="tm-card tm-card-pad">
          <SectionError error={error} onRetry={refetch} title="This trip" />
          <Link to="/trips" className="tm-btn-secondary mt-4">
            Back to my trips
          </Link>
        </div>
      </div>
    );
  }

  const shareUrl = trip?.share?.token
    ? `${window.location.origin}/share/${trip.share.token}`
    : null;
  const isShared = Boolean(trip?.share?.enabled);

  return (
    <div className="tm-page space-y-7">
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Link to="/trips" className="hover:underline">
          My trips
        </Link>
        <ArrowRightIcon className="size-3" />
        <span className="truncate text-slate-700 dark:text-slate-300">{trip.title}</span>
      </nav>

      <TripHero
        location={trip.destination}
        photo={trip.coverPhoto}
        startDate={trip.startDate}
        endDate={trip.endDate}
        days={trip.durationDays}
        badges={
          <>
            {trip.tags?.map((tag) => (
              <HeroBadge key={tag}>{tag}</HeroBadge>
            ))}
            {isShared ? <HeroBadge>public link active</HeroBadge> : null}
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="tm-btn bg-white/15 text-white backdrop-blur hover:bg-white/25"
              title="Re-fetch every source and re-capture the snapshot"
            >
              {refresh.isPending ? (
                <SpinnerIcon className="size-4" />
              ) : (
                <RefreshIcon className="size-4" />
              )}
              Refresh data
            </button>

            <button
              type="button"
              onClick={() => share.mutate(!isShared)}
              disabled={share.isPending}
              className="tm-btn bg-white text-slate-900 hover:bg-slate-100"
            >
              {share.isPending ? (
                <SpinnerIcon className="size-4" />
              ) : (
                <ShareIcon className="size-4" />
              )}
              {isShared ? 'Stop sharing' : 'Share'}
            </button>
          </>
        }
      />

      {isShared && shareUrl ? (
        <div className="tm-card flex flex-wrap items-center gap-3 p-4">
          <LinkIcon className="size-5 shrink-0 text-brand-600 dark:text-brand-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Anyone with this link can view the trip — no account needed
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
              {shareUrl}
            </p>
          </div>
          <div className="flex gap-2">
            <CopyButton value={shareUrl} />
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="tm-btn-secondary"
            >
              Preview
            </a>
          </div>
        </div>
      ) : null}

      {/*
        Keyed by trip id so all editable state re-initialises from props when a
        different trip loads. That is React's intended alternative to syncing
        props into state with an effect, which would cause a cascading render and
        briefly show the previous trip's notes.
      */}
      <TripWorkspace
        key={trip.id}
        trip={trip}
        save={save}
        onRefresh={() => refresh.mutate()}
        refreshing={refresh.isPending}
      />

      <div className="flex justify-end border-t border-slate-200 pt-5 dark:border-slate-800">
        <DeleteButton onConfirm={() => remove.mutate()} pending={remove.isPending} />
      </div>
    </div>
  );
}

/**
 * The editable half of a trip: notes and packing ticks.
 *
 * Split out and keyed by trip id so its state can be initialised straight from
 * props — no effect, no sync, no stale frame.
 */
function TripWorkspace({ trip, save, onRefresh, refreshing }) {
  const toast = useToast();

  const [notes, setNotes] = useState(trip.notes ?? '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [packed, setPacked] = useState(() =>
    Object.fromEntries(
      (trip.packingList ?? []).map((item) => [item.item.toLowerCase(), item.packed])
    )
  );

  /**
   * Persist packing ticks a beat after the last click. Working down a
   * twenty-item list should be one write, not twenty. The timer lives in a ref
   * because mutating a value captured in a render closure is not safe.
   */
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const togglePacked = (key) => {
    setPacked((current) => {
      const next = { ...current, [key]: !current[key] };

      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!trip.packingList?.length) return;
        save.mutate({
          packingList: trip.packingList.map((item) => ({
            item: item.item,
            category: item.category,
            reason: item.reason,
            essential: item.essential,
            packed: Boolean(next[item.item.toLowerCase()]),
          })),
        });
      }, 900);

      return next;
    });
  };

  return (
    <>
      <section className="tm-card tm-card-pad">
        <label htmlFor="trip-notes" className="tm-label mb-2 block">
          Notes
        </label>
        <textarea
          id="trip-notes"
          value={notes}
          rows={3}
          maxLength={5000}
          onChange={(event) => {
            setNotes(event.target.value);
            setNotesDirty(true);
          }}
          placeholder="Bookings, addresses, things you must not forget…"
          className="tm-input resize-y"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-slate-400 dark:text-slate-500">{notes.length}/5000</p>
          {notesDirty ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setNotes(trip.notes ?? '');
                  setNotesDirty(false);
                }}
                className="tm-btn-ghost text-xs"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() =>
                  save.mutate(
                    { notes },
                    {
                      onSuccess: () => {
                        setNotesDirty(false);
                        toast.success('Notes saved');
                      },
                    }
                  )
                }
                disabled={save.isPending}
                className="tm-btn-primary text-xs"
              >
                {save.isPending ? (
                  <SpinnerIcon className="size-3.5" />
                ) : (
                  <CheckIcon className="size-3.5" />
                )}
                Save notes
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <div className="mt-5">
        <TripSnapshotView
          trip={trip}
          onRefresh={onRefresh}
          refreshing={refreshing}
          packingChecked={packed}
          onTogglePacked={togglePacked}
        />
      </div>
    </>
  );
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  return (
    <button
      type="button"
      className="tm-btn-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Your browser blocked clipboard access — copy the link manually.');
        }
      }}
    >
      {copied ? <CheckIcon className="size-4" /> : <LinkIcon className="size-4" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

function DeleteButton({ onConfirm, pending }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="tm-btn-ghost text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
      >
        <TrashIcon className="size-4" />
        Delete this trip
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <p className="text-sm text-slate-600 dark:text-slate-400">Delete permanently?</p>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="tm-btn-secondary text-sm"
      >
        Keep it
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="tm-btn bg-rose-600 text-white hover:bg-rose-700"
      >
        {pending ? <SpinnerIcon className="size-4" /> : <TrashIcon className="size-4" />}
        Delete
      </button>
    </div>
  );
}
