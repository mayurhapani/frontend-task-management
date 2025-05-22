import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { notifyTaskUpdate } from "../js/socket.js";

export default function AddTask() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("medium");
  const [status, setStatus] = useState("Not Started");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [users, setUsers] = useState([]);
  const [user, setUser] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [dueDate, setDueDate] = useState("");
  
  const { taskId } = useParams();
  const navigate = useNavigate();

  const BASE_URL = import.meta.env.VITE_BASE_URL;

  const sendData = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("token");
      let response;
      
      const taskData = {
        title,
        description,
        category,
        assignTo: selectedUserId,
        dueDate: dueDate || null,
      };
      
      if (isEditing) {
        taskData.status = status;
        response = await axios.patch(
          `${BASE_URL}/tasks/update/${taskId}`,
          taskData,
          {
            withCredentials: true,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      } else {
        response = await axios.post(
          `${BASE_URL}/tasks/register`,
          taskData,
          {
            withCredentials: true,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      }

      notifyTaskUpdate(response.data.message);
      toast.success(response.data.message);
      navigate("/");
    } catch (error) {
      if (error.response) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.message);
      }
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/signin");
      return;
    }
    
    // If taskId exists, we're in edit mode
    if (taskId) {
      setIsEditing(true);
      
      // Fetch task data
      const fetchTask = async () => {
        try {
          const response = await axios.get(`${BASE_URL}/tasks/getTask/${taskId}`, {
            withCredentials: true,
            headers: {
              Authorization: "Bearer " + token,
            },
          });
          
          const task = response.data.data;
          setTitle(task.title);
          setDescription(task.description);
          setCategory(task.category);
          setStatus(task.status);
          setSelectedUserId(task.assignTo._id);
          
          // Set due date if it exists
          if (task.dueDate) {
            // Format the date for the input field (YYYY-MM-DD)
            const date = new Date(task.dueDate);
            const formattedDate = date.toISOString().split('T')[0];
            setDueDate(formattedDate);
          }
        } catch (error) {
          if (error.response) {
            toast.error(error.response.data.message);
          } else {
            toast.error(error.message);
          }
          navigate("/");
        }
      };
      
      fetchTask();
    }

    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("token");

        const response = await axios.get(`${BASE_URL}/users/getUser`, {
          withCredentials: true,
          headers: {
            Authorization: "Bearer " + token,
          },
        });

        setUser(response.data.data);
        if (!taskId) {
          setSelectedUserId(response.data.data._id);
        }
      } catch (error) {
        if (error.response) {
          toast.error(error.response.data.message);
        } else {
          toast.error(error.message);
        }
      }
    };

    const selectUser = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/users/getAllUsers`, {
          withCredentials: true,
          headers: {
            Authorization: "Bearer " + token,
          },
        });

        setUsers(response.data.data);
      } catch (error) {
        if (error.response) {
          toast.error(error.response.data.message);
        } else {
          toast.error(error.message);
        }
      }
    };

    fetchUser();
    selectUser();
  }, [BASE_URL, navigate, taskId]);

  return (
    <div className="bg-red-200 min-h-screen">
      <div className="container mx-auto ">
        <div className="flex justify-center items-center min-h-screen py-20">
          <div className="bg-red-100 p-10 rounded-md text-center w-full max-w-2xl">
            <h2 className="mb-5 text-xl font-semibold text-gray-600">
              {isEditing ? "Edit Task" : "Add New Task"}
            </h2>
            <form className="flex flex-col gap-2" onSubmit={sendData}>
              <input
                className="mb-3 p-2 rounded-sm"
                type="text"
                placeholder="Add Title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                name="title"
                required
              />
              <textarea
                className="mb-3 p-2 rounded-sm text-sm"
                type="text"
                rows={5}
                placeholder="Add description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
                name="description"
                required
              ></textarea>
              <select
                className="mb-3 p-2 rounded-sm"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                }}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              {isEditing && (
                <select
                  className="mb-3 p-2 rounded-sm"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                  }}
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Process">In Process</option>
                  <option value="Completed">Completed</option>
                </select>
              )}

              <div className="mb-3">
                <label className="block text-left text-sm text-gray-600 mb-1">Due Date (optional)</label>
                <input
                  className="w-full p-2 rounded-sm"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                  }}
                  name="dueDate"
                />
              </div>

              <select
                className="mb-3 p-2 rounded-sm"
                value={selectedUserId || ""}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                }}
                required
              >
                <option value="" disabled>
                  Select User
                </option>
                {users?.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name}
                  </option>
                ))}
              </select>

              <button className="bg-blue-500 text-white rounded-md py-2 my-4" type="submit">
                {isEditing ? "Update Task" : "Add Task"}
              </button>
              <button 
                className="bg-gray-500 text-white rounded-md py-2" 
                type="button"
                onClick={() => navigate("/")}
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
