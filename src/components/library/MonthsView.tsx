import React from "react";
import styled from "@emotion/styled";
import CoverTile from "./CoverTile";
import { FileData, LibrarySummary } from "../../types/media";
import { daysInMonth, formatMonth, monthKey } from "../../utils/dates";

const Wrapper = styled.div`
  padding-bottom: 90px;
`;

const YearHeading = styled.h2`
  margin: 22px 0 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-color);
  scroll-margin-top: 90px;

  small {
    margin-left: 10px;
    font-size: 13px;
    font-weight: 500;
    opacity: 0.55;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;

  @media (max-width: 600px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

interface MonthsViewProps {
  summary: LibrarySummary;
  covers: Record<string, FileData | null>;
  onRequestCover: (key: string, from: string, to: string) => void;
  onPickMonth: (monthKey: string) => void;
}

const MonthsView: React.FC<MonthsViewProps> = ({
  summary,
  covers,
  onRequestCover,
  onPickMonth,
}) => (
  <Wrapper>
    {summary.years.map((year) => (
      <section key={year.year}>
        <YearHeading id={`year-${year.year}`}>
          {year.year}
          <small>{year.count.toLocaleString()}</small>
        </YearHeading>
        <Grid>
          {year.months.map((month) => {
            const key = monthKey(year.year, month.month);
            const mm = String(month.month).padStart(2, "0");
            return (
              <CoverTile
                key={key}
                label={formatMonth(key)}
                count={month.count}
                cover={covers[key]}
                onRequestCover={() =>
                  onRequestCover(
                    key,
                    `${year.year}${mm}01`,
                    `${year.year}${mm}${daysInMonth(year.year, month.month)}`
                  )
                }
                onClick={() => onPickMonth(key)}
              />
            );
          })}
        </Grid>
      </section>
    ))}
  </Wrapper>
);

export default MonthsView;
