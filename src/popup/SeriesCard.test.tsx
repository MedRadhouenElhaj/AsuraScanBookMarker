import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTrackedSeries } from '../shared/domain';
import { SeriesCard } from './SeriesCard';

const tracked = createTrackedSeries({
  slug: 'infinite-mage-f886a8af',
  title: 'Infinite Mage',
  canonicalUrl: 'https://asurascans.com/comics/infinite-mage-f886a8af',
  pageType: 'chapter',
  currentChapter: {
    id: '100',
    url: 'https://asurascans.com/comics/infinite-mage-f886a8af/chapter/100',
  },
  chapters: [
    {
      availability: 'free',
      id: '101',
      url: 'https://asurascans.com/comics/infinite-mage-f886a8af/chapter/101',
    },
  ],
});

describe('SeriesCard', () => {
  it('renders progress and opens inline manual editing', () => {
    render(
      <SeriesCard
        series={tracked}
        onOpen={vi.fn()}
        onContinue={vi.fn().mockResolvedValue(undefined)}
        onRemove={vi.fn()}
        onProgressChange={vi.fn().mockResolvedValue(undefined)}
        onStatusChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText('Read 100')).toBeInTheDocument();
    expect(screen.getByText('Free 101')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Edit progress'));
    expect(screen.getByPlaceholderText('Chapter')).toHaveValue('100');
  });

  it('marks progress through the latest known chapter', async () => {
    const onProgressChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SeriesCard
        series={tracked}
        onOpen={vi.fn()}
        onContinue={vi.fn().mockResolvedValue(undefined)}
        onRemove={vi.fn()}
        onProgressChange={onProgressChange}
        onStatusChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByText('Edit progress'));
    fireEvent.click(screen.getByText('Read all'));
    expect(onProgressChange).toHaveBeenCalledWith('infinite-mage-f886a8af', '101');
  });

  it('requests the next chapter when Continue reading is clicked', () => {
    const onContinue = vi.fn().mockResolvedValue(undefined);
    render(
      <SeriesCard
        series={tracked}
        onOpen={vi.fn()}
        onContinue={onContinue}
        onRemove={vi.fn()}
        onProgressChange={vi.fn().mockResolvedValue(undefined)}
        onStatusChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByText('Continue reading'));
    expect(onContinue).toHaveBeenCalledWith(tracked);
  });
});
