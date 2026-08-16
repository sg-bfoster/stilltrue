/**
 * Real-world shape: the GCPS school-board check this package was extracted
 * from (bfoster-services). Fetch the district's pages into a text corpus and
 * assert every curated fact still appears — surnames as the roster signal
 * (titles/first names vary in page copy), plus district-size and calendar
 * markers. Unreachable pages warn; only vanished facts fail the build.
 */
import { defineStilltrue, corpus, json, surname } from 'stilltrue';

interface SchoolBoardData {
  members: { name: string }[];
  superintendent?: { name: string };
  districtFacts?: { totalSchools: number; highSchools: number; elementarySchools: number };
  calendar2026_27?: { firstDayHuman: string };
}

export default defineStilltrue({
  drift: [
    {
      name: 'gcps-school-board',
      source: corpus([
        'https://www.gcpsk12.org/about-us',
        'https://www.gcpsk12.org/about-us/board',
        'https://www.gcpsk12.org/about-us/divisions-and-teams/superintendent',
      ]),
      expect: json<SchoolBoardData, string[]>('./data/school-board.json', (d) => [
        ...d.members.map((m) => surname(m.name)),
        ...(d.superintendent ? [surname(d.superintendent.name)] : []),
        ...(d.districtFacts ? [`${d.districtFacts.totalSchools} schools`] : []),
        ...(d.calendar2026_27 ? [d.calendar2026_27.firstDayHuman] : []),
      ]),
      compare: 'contains-all',
    },
  ],
});
