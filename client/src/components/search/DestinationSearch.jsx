import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../../api/endpoints.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { MapPinIcon, SearchIcon, SpinnerIcon } from '../ui/Icons.jsx';
import { formatCompact } from '../../lib/format.js';

/** Accessible destination autocomplete using the ARIA combobox pattern. */
export default function DestinationSearch({
  id,
  value,
  onChange,
  onSelect,
  autoFocus = false,
  placeholder = 'Where are you going?',
  size = 'lg',
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listboxId = useId();

  const debounced = useDebouncedValue(value, 300);

  const { data: results = [], isFetching } = useQuery({
    queryKey: api.keys.search(debounced),
    queryFn: () => api.searchDestinations(debounced, 6),
    enabled: debounced.trim().length >= 2,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const normalizedValue = value.trim();
  const resultsAreCurrent = normalizedValue.length >= 2 && normalizedValue === debounced.trim();
  const visibleResults = resultsAreCurrent ? results : [];

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const highlighted = activeIndex >= 0 && activeIndex < visibleResults.length ? activeIndex : -1;

  const choose = (option) => {
    onChange(option.name);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    onSelect?.(option);
  };

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!visibleResults.length) return;
      setOpen(true);
      setActiveIndex((current) => {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = current + delta;
        if (next < 0) return visibleResults.length - 1;
        if (next >= visibleResults.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Enter') {
      if (open && highlighted >= 0 && visibleResults[highlighted]) {
        event.preventDefault();
        choose(visibleResults[highlighted]);
      } else {
        setOpen(false);
      }
    }
  };

  const inputSize =
    size === 'lg' ? 'min-h-14 py-3.5 pl-12 pr-11 text-base' : 'min-h-11 py-2 pl-10 pr-9 text-sm';
  const iconSize = size === 'lg' ? 'size-5 left-4' : 'size-4 left-3';

  return (
    <div ref={containerRef} className="relative">
      <SearchIcon
        className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-brand-700 dark:text-brand-300 ${iconSize}`}
      />

      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          setActiveIndex(-1);
          setOpen(nextValue.trim().length >= 2);
        }}
        onFocus={() => setOpen(visibleResults.length > 0)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck="false"
        className={`tm-input rounded-2xl ${inputSize}`}
        role="combobox"
        aria-expanded={open && visibleResults.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? `${listboxId}-option-${highlighted}` : undefined}
        aria-label={ariaLabel ?? (id ? undefined : 'Destination')}
        aria-busy={isFetching || undefined}
      />

      {isFetching ? (
        <SpinnerIcon className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
      ) : null}

      {open && visibleResults.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Destination suggestions"
          className="absolute z-40 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-stone-200 bg-white p-1.5 shadow-2xl shadow-stone-900/12 dark:border-stone-700 dark:bg-stone-900"
        >
          {visibleResults.map((option, index) => (
            <li
              key={option.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === highlighted}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
              className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition-colors ${
                index === highlighted
                  ? 'bg-brand-50 text-brand-950 dark:bg-brand-950 dark:text-brand-100'
                  : 'text-stone-900 dark:text-stone-100'
              }`}
            >
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                <MapPinIcon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{option.name}</p>
                <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                  {[option.region, option.country].filter(Boolean).join(', ')}
                </p>
              </div>
              {option.population ? (
                <span className="shrink-0 pt-1 text-[0.68rem] text-stone-400 dark:text-stone-500">
                  {formatCompact(option.population)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
