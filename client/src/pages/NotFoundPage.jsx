import { Link } from 'react-router-dom';
import { CompassIcon } from '../components/ui/Icons.jsx';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center sm:px-6">
      <CompassIcon className="size-12 text-slate-300 dark:text-slate-600" />
      <h1 className="mt-5 text-3xl font-bold text-slate-900 dark:text-slate-100">Off the map</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        That page does not exist. It may have been a shared trip link that has since been turned
        off.
      </p>
      <div className="mt-6 flex gap-2">
        <Link to="/" className="tm-btn-primary">
          Plan a trip
        </Link>
        <Link to="/trips" className="tm-btn-secondary">
          My trips
        </Link>
      </div>
    </div>
  );
}
