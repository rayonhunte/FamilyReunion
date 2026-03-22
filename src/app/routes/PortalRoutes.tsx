import { memo, type ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';

export const PortalRoutes = memo(function PortalRoutes({
  overview,
  profile,
  registration,
  events,
  hotels,
  flights,
  bulletin,
  messages,
  files,
  familyTree,
  help,
  audit,
  organizer,
  admin,
}: {
  overview: ReactElement;
  profile: ReactElement;
  registration: ReactElement;
  events: ReactElement;
  hotels: ReactElement;
  flights: ReactElement;
  bulletin: ReactElement;
  messages: ReactElement;
  files: ReactElement;
  familyTree: ReactElement;
  help: ReactElement;
  audit: ReactElement;
  organizer: ReactElement;
  admin: ReactElement;
}) {
  return (
    <Routes>
      <Route path="/" element={overview} />
      <Route path="profile" element={profile} />
      <Route path="registration" element={registration} />
      <Route path="events" element={events} />
      <Route path="hotels" element={hotels} />
      <Route path="flights" element={flights} />
      <Route path="bulletin" element={bulletin} />
      <Route path="messages" element={messages} />
      <Route path="messages/:threadId" element={messages} />
      <Route path="files" element={files} />
      <Route path="family-tree" element={familyTree} />
      <Route path="help" element={help} />
      <Route path="audit" element={audit} />
      <Route path="organizer" element={organizer} />
      <Route path="admin" element={admin} />
    </Routes>
  );
});
