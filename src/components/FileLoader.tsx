import React from "react";
import UkraineSpinner from "../assets/ukraine.svg";
import { Loader, Spinner } from "./styledComponents";

const FileLoader: React.FC = () => {
  return (
    <Loader>
      <Spinner src={UkraineSpinner} alt="Loading..." />
    </Loader>
  );
};

export default FileLoader;
