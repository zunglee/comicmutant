import { data } from 'react-router';

export function loader() {
  throw data('This page got erased from continuity.', { status: 404 });
}

export default function NotFound() {
  return null;
}
