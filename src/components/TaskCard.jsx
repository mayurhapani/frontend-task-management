import PropTypes from "prop-types";
import axios from "axios";
import { toast } from "react-toastify";
import { useContext } from "react";
import { AuthContext } from "../context/AuthProvider";
import { useNavigate } from "react-router-dom";

export default function TaskCard({ task, user }) {
  const { isRefresh, setIsRefresh } = useContext(AuthContext);
  const navigate = useNavigate();

  const BASE_URL = import.meta.env.VITE_BASE_URL;

  const changeStatus = async (id, newStatus) => {
    try {
      const token = localStorage.getItem("token");

      const response = await axios.patch(
        `${BASE_URL}/tasks/status/${id}`,
        { status: newStatus },
        {
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      console.log("status updated", response);

      toast.success(response.data.message);
      setIsRefresh(!isRefresh);
      navigate("/");
    } catch (error) {
      if (error.response) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.message);
      }
    }
  };

  const deleteTask = async (id) => {
    try {
      const token = localStorage.getItem("token");

      const response = await axios.delete(`${BASE_URL}/tasks/delete/${id}`, {
        withCredentials: true,
        headers: {
          Authorization: "Bearer " + token,
        },
      });

      toast.success(response.data.message);
      setIsRefresh(!isRefresh);
      navigate("/");
    } catch (error) {
      if (error.response) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.message);
      }
    }
  };
  
  const editTask = (id) => {
    navigate(`/editTask/${id}`);
  };

  const getStatusColor = (status) => {
    switch(status) {
      case "Not Started": return "text-red-500";
      case "In Process": return "text-yellow-500";
      case "Completed": return "text-green-500";
      default: return "text-gray-500";
    }
  };
  
  const getCategoryBadgeColor = (category) => {
    switch(category) {
      case "high": return "bg-red-100 text-red-800 border-red-200";
      case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low": return "bg-green-100 text-green-800 border-green-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Format date to readable format
  const formatDate = (dateString) => {
    if (!dateString) return "No due date";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Check if task is overdue
  const isOverdue = () => {
    if (!task.dueDate) return false;
    const dueDate = new Date(task.dueDate);
    const today = new Date();
    return dueDate < today && task.status !== "Completed";
  };

  const overdue = isOverdue();

  return (
    <div className={`rounded-lg shadow-md p-4 border-l-4 transition-all ${
      overdue 
        ? "bg-red-50 border-red-400" 
        : task.status === "Completed" 
          ? "bg-gray-100 border-gray-400" 
          : task.status === "In Process" 
            ? "bg-yellow-50 border-yellow-400" 
            : "bg-white border-blue-400"
    }`}>
      <div className="flex flex-col gap-2">
        {/* Title section */}
        <div className="flex justify-between items-start">
          <h3 className={`text-lg font-semibold ${
            task.status === "Completed" ? "text-gray-500" : "text-gray-800"
          }`}>
            {task.title}
          </h3>
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryBadgeColor(task.category)}`}>
            {task.category}
          </div>
        </div>

        {/* Description */}
        <p className={`text-sm mt-1 ${
          task.status === "Completed" ? "text-gray-400" : "text-gray-600"
        }`}>
          {task.description}
        </p>

        {/* Due date display */}
        {task.dueDate && (
          <div className="flex items-center mt-1">
            <span className={`text-xs ${overdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
              Due: {formatDate(task.dueDate)}
              {overdue && <span className="ml-2 text-red-600 font-bold">OVERDUE</span>}
            </span>
          </div>
        )}

        {/* Status and assignee info */}
        <div className="flex justify-between items-center mt-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Status:</span>
            <span className={`font-medium ${getStatusColor(task.status)}`}>
              {task.status}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-600">For:</span>
            <span className="font-medium text-gray-700">
              @{task?.assignTo?.name}
            </span>
          </div>
        </div>

        {/* Created by info */}
        <div className="text-xs text-gray-500 mt-1">
          Created by: {task.createdBy?.name === user.name ? "You" : task.createdBy?.name}
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-3">
          <button
            className="px-3 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              editTask(task._id);
            }}
          >
            Edit
          </button>
          <button
            className="px-3 py-1 text-xs font-medium rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              deleteTask(task._id);
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

TaskCard.propTypes = {
  task: PropTypes.object.isRequired,
  user: PropTypes.object.isRequired,
};
