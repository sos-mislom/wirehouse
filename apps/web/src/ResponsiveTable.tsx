import { Children, cloneElement, isValidElement, type ReactNode, type ReactElement, type TableHTMLAttributes } from 'react';
function contentText(node: ReactNode): string {
  return Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{children?:ReactNode}>(child) ? contentText(child.props.children) : '').join(' ').trim();
}
/** Keeps real table semantics on desktop and labelled record cards on small screens. */
export function ResponsiveTable({children, className, ...props}: TableHTMLAttributes<HTMLTableElement>) {
  const sections = Children.toArray(children);
  const head = sections.find(section => isValidElement(section) && section.type === 'thead') as ReactElement<{children:ReactNode}> | undefined;
  const headRow = head ? Children.toArray(head.props.children).find(isValidElement) as ReactElement<{children:ReactNode}> : undefined;
  const headers = headRow ? Children.toArray(headRow.props.children).map(contentText) : [];
  return <table {...props} className={`${className || ''} responsive-table`}>{sections.map(section => {
    if (!isValidElement<{children:ReactNode}>(section) || section.type !== 'tbody') return section;
    return cloneElement(section, {}, Children.map(section.props.children, row => {
      if (!isValidElement<{children:ReactNode;onClick?:unknown;tabIndex?:number;onKeyDown?:unknown}>(row) || row.type !== 'tr') return row;
      return cloneElement(row, row.props.onClick ? {tabIndex:0, onKeyDown:(event:React.KeyboardEvent<HTMLTableRowElement>) => {if(event.target===event.currentTarget && ['Enter',' '].includes(event.key)){event.preventDefault();event.currentTarget.click();}}} : {}, Children.map(row.props.children, (cell,index) => {
        if(!isValidElement<{children:ReactNode;'data-label'?:string}>(cell)) return cell;
        return cloneElement(cell, {'data-label':headers[index] || ''}, <div className="cell-value">{cell.props.children}</div>);
      }));
    }));
  })}</table>;
}
