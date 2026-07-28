export default function AdminHomePage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Admin</h1>
      <p className="text-sm text-gray-700">
        Pick a section from the sidebar: review pending Google/Yelp matches, confirm scraped
        awards, or manage invite links.
      </p>
    </div>
  );
}
