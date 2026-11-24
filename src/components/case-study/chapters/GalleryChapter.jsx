import Chapter from './Chapter';
import Gallery from '../Gallery';

// Chapter 4, the gallery strip (issue #31, M6). `regionLabel` names the
// scrollable region (axe `scrollable-region-focusable`); it starts with the
// visible chapter title so the name and the heading agree.
export default function GalleryChapter({ anchor, title, number, items, regionLabel }) {
  return (
    <Chapter anchor={anchor} title={title} number={number} className="cs-gallery">
      <Gallery items={items} label={regionLabel} />
    </Chapter>
  );
}
