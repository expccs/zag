import type { GeoBlock } from '../../socket/geo-store';
import { NoConnectionArt } from './ConnectionLostView';
import { NoticeView } from './NoticeView';

export interface GeoNoticeViewProps {
  block: GeoBlock;
}

const kindOf = (block: GeoBlock) => {
  switch (block) {
    case 'denied':
      return 'geoDenied';
    case 'far':
      return 'geoFar';
    default:
      return 'geoUnknown';
  }
};

/**
 * The location restriction stops the phone: permission refused, out of
 * the zone, or no position at all. Not in Figma: the layout of «Зв'язок
 * втрачено» (whose copy already says «поза зоною дії») with our wording.
 */
export const GeoNoticeView = ({ block }: GeoNoticeViewProps) => (
  <NoticeView kind={kindOf(block)}>
    <NoConnectionArt />
  </NoticeView>
);
