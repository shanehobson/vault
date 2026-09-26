import React from "react";
import styled from "@emotion/styled";
import CoverTile from "./CoverTile";
import { LibrarySummary } from "../../types/media";
import { FileData } from "../../types/media";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  padding-bottom: 90px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

interface YearsViewProps {
  summary: LibrarySummary;
  covers: Record<string, FileData | null>;
  onRequestCover: (key: string, from: string, to: string) => void;
  onPickYear: (year: number) => void;
}

const YearsView: React.FC<YearsViewProps> = ({ summary, covers, onRequestCover, onPickYear }) => (
  <Grid>
    {summary.years.map((year) => {
      const key = `y${year.year}`;
      return (
        <CoverTile
          key={key}
          label={String(year.year)}
          count={year.count}
          cover={covers[key]}
          onRequestCover={() => onRequestCover(key, `${year.year}0101`, `${year.year}1231`)}
          onClick={() => onPickYear(year.year)}
        />
      );
    })}
  </Grid>
);

export default YearsView;
