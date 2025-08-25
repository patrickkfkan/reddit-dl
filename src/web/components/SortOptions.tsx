import { Form, Stack } from 'react-bootstrap';
import { type PageElements } from '../types/PageElements';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

interface SortOptionsProps {
  data: PageElements.SortOptions;
  onChange?: (url: string) => void;
}

function SortOptions({ data, onChange }: SortOptionsProps) {
  const navigate = useNavigate();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const url = e.target.value;
      if (onChange) {
        onChange(url);
        return;
      }
      void navigate(url);
    },
    [onChange]
  );

  return (
    <Stack direction="horizontal" gap={2}>
      Sort by:
      <Form.Select size="sm" className="w-auto ms-2" onChange={handleChange}>
        {data.map((option) => (
          <option
            key={`option-${option.url}`}
            value={option.url}
            selected={option.isCurrent}
          >
            {option.text}
          </option>
        ))}
      </Form.Select>
    </Stack>
  );
}

export default SortOptions;
