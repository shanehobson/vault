import React from "react";
import { FaTrash } from "react-icons/fa";
import { FloatingDeleteButton } from "./styledComponents";


interface DeleteButtonProps {
  deleting: boolean;
  deleteFiles: () => void;
  fadeOutClass: string;
}

const DeleteButton: React.FC<DeleteButtonProps> = ({ deleting, deleteFiles, fadeOutClass }) => {
  return (
    <FloatingDeleteButton className={fadeOutClass} deleting={deleting} disabled={deleting} onClick={deleteFiles}>
      <FaTrash />
    </FloatingDeleteButton>
  );
};

export default DeleteButton;
